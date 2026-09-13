import type { INestApplication } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import { IdentidadeService } from '../identidade/identidade.service';
import { CABECALHO_CSRF, COOKIE_CSRF, COOKIE_SESSAO } from '../identidade/requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';
const CPF = '529.982.247-25';

/** Os primeiros bytes de todo PDF. É o que separa "gerou" de "respondeu algo". */
const ASSINATURA_PDF = '%PDF-';

describe('documento e link do tutor (contra Postgres)', () => {
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
      'TRUNCATE TABLE "item_da_formulacao", "formulacao", "receita", "paciente", "tutor", ' +
        '"restricao_de_forma", "faixa_terapeutica", "insumo", "forma_farmaceutica", ' +
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

  /** Uma receita emitida, do começo ao fim. É o que todo teste daqui precisa. */
  async function receitaEmitida(
    sessao: Sessao,
    opcoes: { cpf?: string | null } = {},
  ): Promise<{ id: string; tokenPublico: string; numero: number }> {
    // Nome e código carregam o contador: forma e insumo têm índice único, e um
    // teste que emite duas receitas esbarraria nele.
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
        controlado: true,
        listaDeControle: 'C1',
      },
    });

    const cpf = opcoes.cpf === undefined ? CPF : opcoes.cpf;
    const tutor = await sessao
      .post('/api/v1/receituario/tutores')
      .send({ nome: 'Marina Prado', telefone: '(11) 98765-4321', ...(cpf ? { cpf } : {}) })
      .expect(201);

    const paciente = await sessao
      .post('/api/v1/receituario/pacientes')
      .send({
        tutorId: tutor.body.id,
        nome: 'Tobias',
        especie: 'CANINO',
        sexo: 'MACHO',
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

    const emitida = await sessao
      .post(`/api/v1/receituario/receitas/${receita.body.id}/emitir`)
      .expect(200);

    return {
      id: emitida.body.id,
      tokenPublico: emitida.body.tokenPublico,
      numero: emitida.body.numero,
    };
  }

  // --- o token ---

  describe('token público', () => {
    it('rascunho não tem link — só a emissão cria um', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const forma = await prisma.formaFarmaceutica.create({ data: { nome: 'CÁPSULAS' } });
      const insumo = await prisma.insumo.create({
        data: {
          codigo: '665',
          descricao: 'Gabapentina',
          custoPorGramaEmMicro: 35_120,
          markupEmCentesimos: 648,
          estoqueEmMiligramas: 500_000,
        },
      });

      const tutor = await vet
        .post('/api/v1/receituario/tutores')
        .send({ nome: 'Marina Prado', cpf: CPF })
        .expect(201);
      const paciente = await vet
        .post('/api/v1/receituario/pacientes')
        .send({
          tutorId: tutor.body.id,
          nome: 'Tobias',
          especie: 'CANINO',
          pesoEmGramas: 12_000,
        })
        .expect(201);

      const rascunho = await vet
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

      expect(rascunho.body.tokenPublico).toBeNull();

      // E o PDF de um rascunho também não existe: não há documento antes de
      // haver assinatura.
      await vet.get(`/api/v1/receituario/receitas/${rascunho.body.id}/pdf`).expect(404);

      const emitida = await vet
        .post(`/api/v1/receituario/receitas/${rascunho.body.id}/emitir`)
        .expect(200);

      expect(emitida.body.tokenPublico).toEqual(expect.any(String));
      expect(emitida.body.tokenPublico.length).toBeGreaterThanOrEqual(43);
    });

    it('cada receita recebe um token diferente', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));

      const primeira = await receitaEmitida(vet);
      const segunda = await receitaEmitida(vet, { cpf: null });

      expect(primeira.tokenPublico).not.toBe(segunda.tokenPublico);
    });

    it('não sai na listagem — quem lista quer achar, não distribuir link', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await receitaEmitida(vet);

      const lista = await vet.get('/api/v1/receituario/receitas').expect(200);

      expect(lista.body.receitas).toHaveLength(1);
      expect(lista.body.receitas[0]).not.toHaveProperty('tokenPublico');
    });
  });

  // --- a página do tutor ---

  describe('consulta pública', () => {
    it('abre sem sessão nenhuma', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { tokenPublico, numero } = await receitaEmitida(vet);

      // `http`, e não `autenticado(...)`: sem cookie, sem CSRF, como o tutor.
      const publica = await http.get(`/api/v1/publico/receitas/${tokenPublico}`).expect(200);

      expect(publica.body.numero).toBe(numero);
      expect(publica.body.situacao).toBe('valida');
      expect(publica.body.pacienteNome).toBe('Tobias');
      expect(publica.body.tutorNome).toBe('Marina Prado');
    });

    it('mostra o CPF só pelas pontas', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { tokenPublico } = await receitaEmitida(vet);

      const publica = await http.get(`/api/v1/publico/receitas/${tokenPublico}`).expect(200);

      expect(publica.body.tutorCpf).toBe('529.***.**7-25');

      // O documento inteiro não pode aparecer em lugar nenhum da resposta —
      // nem num campo que ninguém lembrou de olhar.
      expect(JSON.stringify(publica.body)).not.toContain('52998224725');
      expect(JSON.stringify(publica.body)).not.toContain('529.982.247-25');
    });

    it('não entrega telefone nem endereço do tutor', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { tokenPublico } = await receitaEmitida(vet);

      const publica = await http.get(`/api/v1/publico/receitas/${tokenPublico}`).expect(200);

      expect(JSON.stringify(publica.body)).not.toContain('98765-4321');
      expect(JSON.stringify(publica.body)).not.toContain('987654321');
    });

    it('não conta como o preço foi formado', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { tokenPublico } = await receitaEmitida(vet);

      const publica = await http.get(`/api/v1/publico/receitas/${tokenPublico}`).expect(200);

      // O total aparece: é por isso que o tutor abre o link. O custo do insumo
      // e a margem, não — são a negociação da farmácia.
      expect(publica.body.valorTotalEmCentavos).toBeGreaterThan(0);
      const texto = JSON.stringify(publica.body);
      expect(texto).not.toContain('custo');
      expect(texto).not.toContain('markup');
      expect(texto).not.toContain('35120');
    });

    it('token que não existe responde 404', async () => {
      await http.get('/api/v1/publico/receitas/naoexisteesseTokenAqui').expect(404);
    });

    it('receita cancelada continua abrindo, e diz que foi cancelada', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { id, tokenPublico } = await receitaEmitida(vet);

      await vet
        .post(`/api/v1/receituario/receitas/${id}/cancelar`)
        .send({ motivo: 'Dose revista depois da consulta.' })
        .expect(200);

      // Sumir com a página seria pior: o tutor com o link na mão veria "não
      // encontrado" e iria à farmácia achando que só perdeu o documento.
      const publica = await http.get(`/api/v1/publico/receitas/${tokenPublico}`).expect(200);

      expect(publica.body.situacao).toBe('cancelada');
      expect(publica.body.motivoDoCancelamento).toBe('Dose revista depois da consulta.');
    });
  });

  // --- o PDF ---

  describe('PDF', () => {
    it('sai pelo link do tutor, e é um PDF de verdade', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { tokenPublico, numero } = await receitaEmitida(vet);

      const resposta = await http
        .get(`/api/v1/publico/receitas/${tokenPublico}/pdf`)
        .buffer()
        .parse((res, callback) => {
          const pedacos: Buffer[] = [];
          res.on('data', (p: Buffer) => pedacos.push(p));
          res.on('end', () => callback(null, Buffer.concat(pedacos)));
        })
        .expect(200);

      expect(resposta.headers['content-type']).toContain('application/pdf');
      expect(resposta.headers['content-disposition']).toContain(
        `receita-${String(numero).padStart(4, '0')}.pdf`,
      );
      expect(Buffer.from(resposta.body).subarray(0, 5).toString()).toBe(ASSINATURA_PDF);
    });

    it('sai também para quem prescreveu, com sessão', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { id } = await receitaEmitida(vet);

      const resposta = await vet.get(`/api/v1/receituario/receitas/${id}/pdf`).expect(200);

      expect(resposta.headers['content-type']).toContain('application/pdf');
    });

    it('não sai para o veterinário de outra clientela', async () => {
      const ana = autenticado(await entrarComo('VETERINARIO'));
      const bruno = autenticado(await entrarComo('VETERINARIO'));
      const { id } = await receitaEmitida(ana);

      // 404 e não 403: 403 confirmaria que aquela receita existe.
      await bruno.get(`/api/v1/receituario/receitas/${id}/pdf`).expect(404);
    });

    it('exige sessão na rota de quem prescreve', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { id } = await receitaEmitida(vet);

      await http.get(`/api/v1/receituario/receitas/${id}/pdf`).expect(401);
    });

    it('não entra em cache compartilhado — é documento de paciente', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { tokenPublico } = await receitaEmitida(vet);

      const resposta = await http.get(`/api/v1/publico/receitas/${tokenPublico}`).expect(200);

      expect(resposta.headers['cache-control']).toContain('private');
      expect(resposta.headers['cache-control']).toContain('no-store');
    });
  });
});
