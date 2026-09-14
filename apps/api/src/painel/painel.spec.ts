import type { INestApplication } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import { IdentidadeService } from '../identidade/identidade.service';
import { CABECALHO_CSRF, COOKIE_CSRF, COOKIE_SESSAO } from '../identidade/requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';

/**
 * O painel (ADR 0017).
 *
 * O que estes testes guardam, em ordem de gravidade: que o painel **não conta
 * o que a lista não mostra** — um veterinário que visse no total as receitas
 * de um colega teria a carteira alheia vazada por dentro de uma métrica; que
 * o valor prescrito **não inclui rascunho**, que é o erro que a v1 cometia ao
 * chamar de faturamento a soma de todo orçamento; e que os blocos de quem vê
 * tudo não aparecem para quem não vê.
 */
describe('painel (contra Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof cliente>;

  beforeAll(async () => {
    ({ app, prisma } = await subirAplicacao());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await limparBanco(prisma);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "pedido", "item_da_formulacao", "formulacao", "receita", "paciente", ' +
        '"tutor", "restricao_de_forma", "faixa_terapeutica", "insumo", "forma_farmaceutica", ' +
        '"clinica_usuario", "clinica", "condicoes_comerciais" CASCADE',
    );
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "receita_numero_seq" RESTART WITH 1');
    http = cliente(app);
  });

  // --- apoio ---

  let contador = 0;

  async function entrarComo(papel: Papel): Promise<{ id: string; sessao: string; csrf: string }> {
    contador += 1;
    const email = `${papel.toLowerCase()}-${contador}@clinica.test`;

    const criado = await app.get(IdentidadeService).criarUsuario(
      {
        email,
        nome: `Dr ${papel} ${contador}`,
        papel,
        senha: SENHA,
        ...(papel === 'VETERINARIO' ? { crmv: `SP-${1000 + contador}` } : {}),
      },
      { id: null },
    );

    const resposta = await http
      .post('/api/v1/auth/entrar')
      .send({ email, senha: SENHA })
      .expect(204);

    return {
      id: criado.id,
      sessao: cookieDa(resposta, COOKIE_SESSAO),
      csrf: cookieDa(resposta, COOKIE_CSRF),
    };
  }

  function autenticado(credenciais: { sessao: string; csrf: string }) {
    const cookie = `${COOKIE_SESSAO}=${credenciais.sessao}`;

    return {
      get: (caminho: string) => http.get(caminho).set('Cookie', cookie),
      post: (caminho: string) =>
        http.post(caminho).set('Cookie', cookie).set(CABECALHO_CSRF, credenciais.csrf),
    };
  }

  type Sessao = ReturnType<typeof autenticado>;

  /** Um rascunho com um ativo. Devolve o id para quem quiser emitir depois. */
  async function rascunho(sessao: Sessao): Promise<{ id: string }> {
    contador += 1;
    const forma = await prisma.formaFarmaceutica.create({
      data: { nome: `CÁPSULAS ${contador}` },
    });
    const insumo = await prisma.insumo.create({
      data: {
        codigo: `665-${contador}`,
        descricao: 'Gabapentina',
        custoPorGramaEmMicro: 35_120,
        markupEmCentesimos: 648,
        estoqueEmMiligramas: 500_000,
      },
    });

    const tutor = await sessao
      .post('/api/v1/receituario/tutores')
      .send({
        nome: `Tutor ${contador}`,
        telefone: '(11) 98765-4321',
        // Endereço completo porque um dos testes manda o pedido ao tutor, e
        // sem endereço a API recusa — com razão.
        cep: '05422-010',
        logradouro: 'Rua das Acácias',
        numero: '120',
        bairro: 'Pinheiros',
        cidade: 'São Paulo',
        uf: 'SP',
      })
      .expect(201);

    const paciente = await sessao
      .post('/api/v1/receituario/pacientes')
      .send({
        tutorId: tutor.body.id,
        nome: `Bicho ${contador}`,
        especie: 'CANINO',
        pesoEmGramas: 12_000,
      })
      .expect(201);

    const receita = await sessao
      .post('/api/v1/receituario/receitas')
      .send({
        pacienteId: paciente.body.id,
        formulacoes: [
          {
            formaId: forma.id,
            frequenciaHoras: 12,
            dias: 10,
            itens: [{ insumoId: insumo.id, doseMg: 100 }],
          },
        ],
      })
      .expect(201);

    return { id: receita.body.id };
  }

  async function emitida(sessao: Sessao): Promise<{ id: string }> {
    const r = await rascunho(sessao);
    await sessao.post(`/api/v1/receituario/receitas/${r.id}/emitir`).expect(200);
    return r;
  }

  async function painelDe(sessao: Sessao) {
    const resposta = await sessao.get('/api/v1/painel').expect(200);
    return resposta.body;
  }

  // --- acesso ---

  describe('acesso', () => {
    it('recusa quem não entrou', async () => {
      await http.get('/api/v1/painel').expect(401);
    });

    it('todo papel com sessão tem painel', async () => {
      for (const papel of ['ADMIN', 'VETERINARIO', 'FARMACIA', 'CLINICA'] as const) {
        const sessao = autenticado(await entrarComo(papel));
        await sessao.get('/api/v1/painel').expect(200);
      }
    });
  });

  // --- o que mais importa ---

  describe('o painel não conta o que a lista não mostra', () => {
    it('um veterinário não vê no total as receitas do outro', async () => {
      const vetA = autenticado(await entrarComo('VETERINARIO'));
      const vetB = autenticado(await entrarComo('VETERINARIO'));

      await rascunho(vetA);
      await rascunho(vetB);
      await rascunho(vetB);

      expect((await painelDe(vetA)).rascunhos).toBe(1);
      expect((await painelDe(vetB)).rascunhos).toBe(2);
    });

    it('nem nas últimas receitas', async () => {
      const vetA = autenticado(await entrarComo('VETERINARIO'));
      const vetB = autenticado(await entrarComo('VETERINARIO'));

      await rascunho(vetA);
      await rascunho(vetB);

      const painel = await painelDe(vetA);

      expect(painel.ultimas).toHaveLength(1);
      // Se algum dia a lista das últimas deixar de passar pelo escopo, é aqui
      // que aparece: o nome do tutor do colega numa tela que não é dele.
      expect(painel.ultimas[0].tutorNome).not.toContain('Tutor 2');
    });

    it('ADMIN e FARMACIA veem tudo, porque precisam', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await rascunho(vet);
      await rascunho(vet);

      const admin = autenticado(await entrarComo('ADMIN'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));

      expect((await painelDe(admin)).rascunhos).toBe(2);
      expect((await painelDe(farmacia)).rascunhos).toBe(2);
    });

    it('CLINICA sem vínculo não vê receita nenhuma', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await rascunho(vet);

      const clinica = autenticado(await entrarComo('CLINICA'));
      const painel = await painelDe(clinica);

      expect(painel.rascunhos).toBe(0);
      expect(painel.ultimas).toEqual([]);
    });
  });

  // --- o valor ---

  describe('valor prescrito', () => {
    /**
     * O preço só é congelado na emissão, então hoje um rascunho tem valor
     * nulo e a soma o ignoraria de qualquer jeito. O teste grava um valor no
     * rascunho **à mão** justamente por isso: sem essa linha ele passa mesmo
     * que alguém tire o `estado: 'EMITIDA'` da consulta, e o que se quer
     * guardar é o filtro, não o acaso de o campo estar vazio. Se um dia a
     * cotação passar a ser gravada no rascunho, este teste é o que impede o
     * painel de contá-la como dinheiro.
     */
    it('não soma rascunho: cotação não é dinheiro', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await rascunho(vet);
      await prisma.formulacao.updateMany({ data: { valorEmCentavos: 9_900 } });

      expect((await painelDe(vet)).valorPrescritoNoMesEmCentavos).toBe(0);
    });

    it('soma o que foi emitido no mês', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);

      const painel = await painelDe(vet);

      expect(painel.valorPrescritoNoMesEmCentavos).toBeGreaterThan(0);
      expect(painel.emitidasNoMes).toBe(1);
    });

    it('ignora o que foi emitido em mês anterior', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);

      // Empurra a emissão para trás. O mês corrente é o que a farmácia usa
      // para fechar conta — janela móvel daria um número que não bate com
      // fechamento nenhum.
      await prisma.receita.updateMany({ data: { emitidaEm: new Date('2020-01-15T10:00:00Z') } });

      const painel = await painelDe(vet);

      expect(painel.emitidasNoMes).toBe(0);
      expect(painel.valorPrescritoNoMesEmCentavos).toBe(0);
    });
  });

  // --- vencimento ---

  describe('vencendo', () => {
    it('conta a que vence nos próximos dias', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);
      await prisma.receita.updateMany({
        data: { validaAte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
      });

      expect((await painelDe(vet)).vencendo).toBe(1);
    });

    it('não conta a que já venceu — isso é histórico, não aviso', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);
      await prisma.receita.updateMany({
        data: { validaAte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      expect((await painelDe(vet)).vencendo).toBe(0);
    });

    it('não conta a que ainda está longe', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);
      await prisma.receita.updateMany({
        data: { validaAte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
      });

      expect((await painelDe(vet)).vencendo).toBe(0);
    });
  });

  // --- blocos por papel ---

  describe('o que só quem vê tudo recebe', () => {
    it('a fila da farmácia e o top de veterinários vêm nulos para o veterinário', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const painel = await painelDe(vet);

      // Nulo, e não lista vazia: a tela precisa distinguir "não é para você"
      // de "não há nenhum" para não desenhar um bloco vazio.
      expect(painel.fila).toBeNull();
      expect(painel.topVeterinarios).toBeNull();
    });

    it('e para a clínica também', async () => {
      const clinica = autenticado(await entrarComo('CLINICA'));
      const painel = await painelDe(clinica);

      expect(painel.fila).toBeNull();
      expect(painel.topVeterinarios).toBeNull();
    });

    it('a fila vem com os três degraus, mesmo zerados', async () => {
      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const painel = await painelDe(farmacia);

      // Forma estável: um degrau que some quando zera faria a fila mudar de
      // formato a cada carga, e a tela dançar junto.
      expect(painel.fila.map((d: { estado: string }) => d.estado)).toEqual([
        'EM_ANALISE',
        'EM_PRODUCAO',
        'PRONTO',
      ]);
      expect(painel.fila.every((d: { quantidade: number }) => d.quantidade === 0)).toBe(true);
    });

    it('conta o pedido enviado no degrau certo', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const receita = await emitida(vet);
      await vet
        .post('/api/v1/pedidos')
        .send({ receitaId: receita.id, destino: 'TUTOR' })
        .expect(201);

      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const painel = await painelDe(farmacia);

      expect(
        painel.fila.find((d: { estado: string }) => d.estado === 'EM_ANALISE').quantidade,
      ).toBe(1);
    });

    it('o top de veterinários ranqueia por emissões do mês', async () => {
      const vetA = autenticado(await entrarComo('VETERINARIO'));
      const vetB = autenticado(await entrarComo('VETERINARIO'));

      await emitida(vetA);
      await emitida(vetB);
      await emitida(vetB);

      const admin = autenticado(await entrarComo('ADMIN'));
      const painel = await painelDe(admin);

      expect(painel.topVeterinarios).toHaveLength(2);
      // O primeiro é quem mais emitiu — se a ordenação se perder, este é o
      // teste que cai.
      expect(painel.topVeterinarios[0].receitas).toBe(2);
      expect(painel.topVeterinarios[1].receitas).toBe(1);
    });

    it('o top não conta rascunho', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await rascunho(vet);

      const admin = autenticado(await entrarComo('ADMIN'));

      expect((await painelDe(admin)).topVeterinarios).toEqual([]);
    });
  });

  // --- últimas ---

  describe('últimas receitas', () => {
    it('vêm da mais nova para a mais velha', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const primeira = await rascunho(vet);
      const segunda = await rascunho(vet);

      const painel = await painelDe(vet);

      expect(painel.ultimas.map((r: { id: string }) => r.id)).toEqual([segunda.id, primeira.id]);
    });

    it('trazem o paciente e o tutor, que é como a pessoa reconhece a receita', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await rascunho(vet);

      const [ultima] = (await painelDe(vet)).ultimas;

      expect(ultima.pacienteNome).toMatch(/^Bicho /);
      expect(ultima.tutorNome).toMatch(/^Tutor /);
      expect(ultima.estado).toBe('RASCUNHO');
      expect(ultima.numero).toBeNull();
    });

    it('param em oito', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      for (let i = 0; i < 9; i += 1) await rascunho(vet);

      expect((await painelDe(vet)).ultimas).toHaveLength(8);
    });
  });

  // --- instalação nova ---

  describe('instalação sem nada', () => {
    it('responde com zeros em vez de quebrar', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));
      const painel = await painelDe(admin);

      expect(painel).toMatchObject({
        rascunhos: 0,
        emitidasNoMes: 0,
        vencendo: 0,
        valorPrescritoNoMesEmCentavos: 0,
        topVeterinarios: [],
        ultimas: [],
      });
    });
  });
});
