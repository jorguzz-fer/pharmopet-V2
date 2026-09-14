import type { INestApplication } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import { IdentidadeService } from '../identidade/identidade.service';
import { CABECALHO_CSRF, COOKIE_CSRF, COOKIE_SESSAO } from '../identidade/requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';

/**
 * O relatório de prescrições.
 *
 * O que estes testes guardam: que só entra receita **emitida** — rascunho tem
 * preço de cotação, e contá-lo faria o número mudar sozinho entre duas
 * aberturas; que a quebra por clínica **fecha com o total**, inclusive o
 * atendimento sem clínica, porque relatório que não fecha não serve para
 * acertar conta; e que quem prescreve não abre o relatório, que mostraria o
 * volume dos colegas.
 */
describe('relatórios (contra Postgres)', () => {
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
      .send({ nome: `Tutor ${contador}`, telefone: '(11) 98765-4321' })
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

  async function relatorio(sessao: Sessao, mes?: string) {
    const caminho = mes
      ? `/api/v1/relatorios/prescricoes?mes=${mes}`
      : '/api/v1/relatorios/prescricoes';

    return (await sessao.get(caminho).expect(200)).body;
  }

  // --- acesso ---

  describe('quem abre', () => {
    it('recusa quem não entrou', async () => {
      await http.get('/api/v1/relatorios/prescricoes').expect(401);
    });

    it('ADMIN e FARMACIA abrem — são quem fecha conta', async () => {
      await autenticado(await entrarComo('ADMIN'))
        .get('/api/v1/relatorios/prescricoes')
        .expect(200);
      await autenticado(await entrarComo('FARMACIA'))
        .get('/api/v1/relatorios/prescricoes')
        .expect(200);
    });

    /**
     * Não é mesquinharia: o relatório soma o volume de todos, e entregá-lo a
     * quem prescreve é mostrar o movimento dos colegas. É a mesma razão de o
     * ranking não aparecer no painel do veterinário.
     */
    it('veterinário e clínica não abrem', async () => {
      await autenticado(await entrarComo('VETERINARIO'))
        .get('/api/v1/relatorios/prescricoes')
        .expect(403);
      await autenticado(await entrarComo('CLINICA'))
        .get('/api/v1/relatorios/prescricoes')
        .expect(403);
    });
  });

  // --- o que entra na conta ---

  describe('o que entra', () => {
    it('conta a receita emitida', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);

      const corpo = await relatorio(autenticado(await entrarComo('ADMIN')));

      expect(corpo.receitas).toBe(1);
      expect(corpo.valorEmCentavos).toBeGreaterThan(0);
    });

    it('não conta rascunho', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await rascunho(vet);

      const corpo = await relatorio(autenticado(await entrarComo('ADMIN')));

      expect(corpo.receitas).toBe(0);
      expect(corpo.valorEmCentavos).toBe(0);
    });

    /**
     * O caso que prova o `estado: 'EMITIDA'` da consulta.
     *
     * No caminho normal ele é redundante: só receita emitida tem `emitidaEm`,
     * e o filtro de data já barraria o rascunho. Um teste que só cria um
     * rascunho passa mesmo sem a cláusula, e foi o que o meu fazia — lia como
     * se guardasse o filtro de estado e guardava o de data.
     *
     * Aqui o rascunho recebe `emitidaEm` **e** preço direto no banco: é o
     * estado corrompido contra o qual a cláusula existe, e o único jeito de
     * fazê-la falar.
     */
    it('não conta rascunho nem com data e preço gravados por fora', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await rascunho(vet);
      await prisma.receita.updateMany({ data: { emitidaEm: new Date() } });
      await prisma.formulacao.updateMany({ data: { valorEmCentavos: 9_900 } });

      const corpo = await relatorio(autenticado(await entrarComo('ADMIN')));

      expect(corpo.receitas).toBe(0);
      expect(corpo.valorEmCentavos).toBe(0);
    });

    it('não conta o que foi emitido em outro mês', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);
      await prisma.receita.updateMany({ data: { emitidaEm: new Date(2020, 0, 15) } });

      const admin = autenticado(await entrarComo('ADMIN'));

      expect((await relatorio(admin)).receitas).toBe(0);
      expect((await relatorio(admin, '2020-01')).receitas).toBe(1);
    });

    /**
     * O limite superior é a virada do mês, e a comparação é exclusiva. Com
     * `lte` no último dia à meia-noite, tudo que saísse depois das 00:00 do
     * dia 31 sumia do relatório daquele mês.
     */
    it('conta o que saiu no último instante do mês', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);
      await prisma.receita.updateMany({
        data: { emitidaEm: new Date(2026, 0, 31, 23, 59, 59, 999) },
      });

      expect((await relatorio(autenticado(await entrarComo('ADMIN')), '2026-01')).receitas).toBe(1);
    });

    it('e não conta o primeiro instante do mês seguinte', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);
      await prisma.receita.updateMany({ data: { emitidaEm: new Date(2026, 1, 1, 0, 0, 0, 0) } });

      expect((await relatorio(autenticado(await entrarComo('ADMIN')), '2026-01')).receitas).toBe(0);
    });
  });

  // --- as quebras ---

  describe('as quebras', () => {
    it('somam o mesmo total, cada uma pelo seu eixo', async () => {
      const vetA = autenticado(await entrarComo('VETERINARIO'));
      const vetB = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vetA);
      await emitida(vetB);
      await emitida(vetB);

      const corpo = await relatorio(autenticado(await entrarComo('ADMIN')));

      const soma = (linhas: { valorEmCentavos: number }[]) =>
        linhas.reduce((t, l) => t + l.valorEmCentavos, 0);

      // Se uma quebra não fechar com o total, o relatório não presta para
      // acertar conta — e é assim que se descobre.
      expect(soma(corpo.porVeterinario)).toBe(corpo.valorEmCentavos);
      expect(soma(corpo.porClinica)).toBe(corpo.valorEmCentavos);
      expect(corpo.porVeterinario).toHaveLength(2);
    });

    it('o atendimento sem clínica vira uma linha, em vez de sumir', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);

      const corpo = await relatorio(autenticado(await entrarComo('ADMIN')));

      expect(corpo.porClinica).toHaveLength(1);
      expect(corpo.porClinica[0].nome).toMatch(/Sem clínica/);
      expect(corpo.porClinica[0].id).toBeNull();
    });

    it('ordena do maior valor para o menor', async () => {
      const vetA = autenticado(await entrarComo('VETERINARIO'));
      const vetB = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vetA);
      await emitida(vetB);
      await emitida(vetB);

      const corpo = await relatorio(autenticado(await entrarComo('ADMIN')));

      expect(corpo.porVeterinario[0].receitas).toBe(2);
      expect(corpo.porVeterinario[1].receitas).toBe(1);
    });

    it('traz o CRMV que assinou, e não o cadastro de hoje', async () => {
      const credenciais = await entrarComo('VETERINARIO');
      const vet = autenticado(credenciais);
      await emitida(vet);

      // O cadastro muda; o documento emitido não.
      await prisma.usuario.update({
        where: { id: credenciais.id },
        data: { crmv: 'SP-OUTRO' },
      });

      const corpo = await relatorio(autenticado(await entrarComo('ADMIN')));

      expect(corpo.porVeterinario[0].detalhe).not.toBe('SP-OUTRO');
    });
  });

  // --- mês inválido ---

  describe('mês inválido', () => {
    it.each(['2026-13', '2026-00'])('responde 400 para %p, e não 500', async (mes) => {
      const admin = autenticado(await entrarComo('ADMIN'));

      await admin.get(`/api/v1/relatorios/prescricoes?mes=${mes}`).expect(400);
    });

    it.each(['setembro', '2026', '2026-9'])('responde 400 para a forma %p', async (mes) => {
      const admin = autenticado(await entrarComo('ADMIN'));

      await admin.get(`/api/v1/relatorios/prescricoes?mes=${mes}`).expect(400);
    });
  });

  // --- planilha ---

  describe('planilha', () => {
    it('sai como CSV para baixar, com o mês no nome do arquivo', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));

      const resposta = await admin
        .get('/api/v1/relatorios/prescricoes.csv?mes=2026-03')
        .expect(200);

      expect(resposta.headers['content-type']).toContain('text/csv');
      expect(resposta.headers['content-disposition']).toContain('prescricoes-2026-03.csv');
    });

    it('começa com BOM e separa por ponto e vírgula, para o Excel em pt-BR', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await emitida(vet);
      const admin = autenticado(await entrarComo('ADMIN'));

      const texto = (await admin.get('/api/v1/relatorios/prescricoes.csv').expect(200)).text;

      expect(texto.charCodeAt(0)).toBe(0xfeff);
      expect(texto).toContain('Quebra;Nome;CRMV;Receitas;Valor prescrito (R$)');
      // Uma linha de veterinário e uma de clínica, além do cabeçalho.
      expect(texto.trimEnd().split('\r\n')).toHaveLength(3);
    });

    it('e também recusa mês inválido', async () => {
      const admin = autenticado(await entrarComo('ADMIN'));

      await admin.get('/api/v1/relatorios/prescricoes.csv?mes=2026-13').expect(400);
    });

    it('não abre para quem não fecha conta', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));

      await vet.get('/api/v1/relatorios/prescricoes.csv').expect(403);
    });
  });
});
