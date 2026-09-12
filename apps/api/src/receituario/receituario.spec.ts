import type { INestApplication } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import { IdentidadeService } from '../identidade/identidade.service';
import { CABECALHO_CSRF, COOKIE_CSRF, COOKIE_SESSAO } from '../identidade/requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';

/** CPF consistente, para o teste falar de validação e não de dígito verificador. */
const CPF = '529.982.247-25';

describe('receituário (contra Postgres)', () => {
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
        '"condicoes_comerciais" CASCADE',
    );
    // A sequence do número da receita vive fora das tabelas, então o TRUNCATE
    // não a alcança. Sem isto, o primeiro número mudaria a cada execução.
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "receita_numero_seq" RESTART WITH 1');
    http = cliente(app);
  });

  // --- apoio ---

  let contador = 0;

  async function entrarComo(
    papel: Papel,
    extras: { crmv?: string | null } = {},
  ): Promise<{ id: string; sessao: string; csrf: string }> {
    contador += 1;
    const email = `${papel.toLowerCase()}-${contador}@clinica.test`;

    const criado = await app.get(IdentidadeService).criarUsuario(
      {
        email,
        nome: `Dr ${papel} ${contador}`,
        papel,
        senha: SENHA,
        ...(papel === 'VETERINARIO' ? { crmv: extras.crmv ?? `SP-${1000 + contador}` } : {}),
      },
      { id: null },
    );

    if (extras.crmv === null) {
      await prisma.usuario.update({ where: { id: criado.id }, data: { crmv: null } });
    }

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
      put: (caminho: string) =>
        http.put(caminho).set('Cookie', cookie).set(CABECALHO_CSRF, credenciais.csrf),
      patch: (caminho: string) =>
        http.patch(caminho).set('Cookie', cookie).set(CABECALHO_CSRF, credenciais.csrf),
    };
  }

  type Sessao = ReturnType<typeof autenticado>;

  async function semearCatalogo(): Promise<{
    capsulaId: string;
    pastaId: string;
    gabapentinaId: string;
    amoxicilinaId: string;
  }> {
    const capsula = await prisma.formaFarmaceutica.create({ data: { nome: 'CÁPSULAS' } });
    const pasta = await prisma.formaFarmaceutica.create({ data: { nome: 'PASTA' } });

    const gabapentina = await prisma.insumo.create({
      data: {
        codigo: '665',
        descricao: 'Gabapentina',
        custoPorGramaEmMicro: 35_120,
        markupEmCentesimos: 648,
        estoqueEmMiligramas: 500_000,
        controlado: true,
        listaDeControle: 'C1',
      },
    });

    const amoxicilina = await prisma.insumo.create({
      data: {
        codigo: '120',
        descricao: 'Amoxicilina',
        custoPorGramaEmMicro: 21_000,
        markupEmCentesimos: 500,
        estoqueEmMiligramas: 900_000,
        listaDeControle: 'ANTIMICROBIANO',
      },
    });

    return {
      capsulaId: capsula.id,
      pastaId: pasta.id,
      gabapentinaId: gabapentina.id,
      amoxicilinaId: amoxicilina.id,
    };
  }

  async function semearFicha(
    sessao: Sessao,
    dados: { cpf?: string | null; pesoEmGramas?: number | null } = {},
  ): Promise<{ tutorId: string; pacienteId: string }> {
    // `cpf: null` abre ficha sem documento — é o que permite semear vários
    // tutores no mesmo teste sem esbarrar no índice único, que é regra real.
    const cpf = dados.cpf === undefined ? CPF : dados.cpf;

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
        ...(dados.pesoEmGramas === undefined ? { pesoEmGramas: 12_000 } : {}),
        ...(typeof dados.pesoEmGramas === 'number' ? { pesoEmGramas: dados.pesoEmGramas } : {}),
      })
      .expect(201);

    return { tutorId: tutor.body.id, pacienteId: paciente.body.id };
  }

  function fórmula(formaId: string, insumoId: string, doseMg = 100) {
    return { formaId, frequenciaHoras: 12, dias: 10, itens: [{ insumoId, doseMg }] };
  }

  // --- acesso ---

  describe('acesso', () => {
    it('recusa quem não entrou', async () => {
      await http.get('/api/v1/receituario/tutores').expect(401);
      await http.get('/api/v1/receituario/receitas').expect(401);
    });

    it('recusa FARMACIA cadastrando tutor — quem cadastra é quem atende', async () => {
      const farmacia = autenticado(await entrarComo('FARMACIA'));

      await farmacia
        .post('/api/v1/receituario/tutores')
        .send({ nome: 'Marina Prado' })
        .expect(403);
    });

    it.each(['ADMIN', 'FARMACIA'] as const)('recusa %s abrindo receita', async (papel) => {
      const outro = autenticado(await entrarComo(papel));

      await outro
        .post('/api/v1/receituario/receitas')
        .send({ pacienteId: '00000000-0000-4000-8000-000000000000', formulacoes: [] })
        .expect(403);
    });
  });

  /**
   * O ponto mais delicado da fase: numa instalação só, com vários veterinários,
   * a lista de tutores de um é a carteira de clientes do outro.
   */
  describe('visibilidade entre veterinários', () => {
    it('um veterinário não enxerga o tutor do outro', async () => {
      const ana = autenticado(await entrarComo('VETERINARIO'));
      const bruno = autenticado(await entrarComo('VETERINARIO'));

      const { tutorId } = await semearFicha(ana);

      const lista = await bruno.get('/api/v1/receituario/tutores').expect(200);
      expect(lista.body.tutores).toHaveLength(0);

      // 404, e não 403: 403 confirmaria que aquele id existe.
      await bruno.get(`/api/v1/receituario/tutores/${tutorId}`).expect(404);
    });

    it('nem altera a ficha alheia', async () => {
      const ana = autenticado(await entrarComo('VETERINARIO'));
      const bruno = autenticado(await entrarComo('VETERINARIO'));
      const { tutorId } = await semearFicha(ana);

      await bruno
        .patch(`/api/v1/receituario/tutores/${tutorId}`)
        .send({ nome: 'Outro nome' })
        .expect(404);

      const conferencia = await ana.get(`/api/v1/receituario/tutores/${tutorId}`).expect(200);
      expect(conferencia.body.nome).toBe('Marina Prado');
    });

    it('nem pendura um paciente na ficha alheia', async () => {
      const ana = autenticado(await entrarComo('VETERINARIO'));
      const bruno = autenticado(await entrarComo('VETERINARIO'));
      const { tutorId } = await semearFicha(ana);

      await bruno
        .post('/api/v1/receituario/pacientes')
        .send({ tutorId, nome: 'Intruso', especie: 'CANINO' })
        .expect(404);
    });

    it.each(['ADMIN', 'FARMACIA'] as const)('%s enxerga tudo, porque precisa', async (papel) => {
      const ana = autenticado(await entrarComo('VETERINARIO'));
      await semearFicha(ana);

      const outro = autenticado(await entrarComo(papel));
      const lista = await outro.get('/api/v1/receituario/tutores').expect(200);

      expect(lista.body.tutores).toHaveLength(1);
    });

    it('um veterinário não enxerga a receita do outro', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const ana = autenticado(await entrarComo('VETERINARIO'));
      const bruno = autenticado(await entrarComo('VETERINARIO'));
      const { pacienteId } = await semearFicha(ana);

      const receita = await ana
        .post('/api/v1/receituario/receitas')
        .send({ pacienteId, formulacoes: [fórmula(capsulaId, gabapentinaId)] })
        .expect(201);

      await bruno.get(`/api/v1/receituario/receitas/${receita.body.id}`).expect(404);

      const daFarmacia = autenticado(await entrarComo('FARMACIA'));
      await daFarmacia.get(`/api/v1/receituario/receitas/${receita.body.id}`).expect(200);
    });
  });

  // --- cadastro ---

  describe('tutor', () => {
    it('recusa CPF com dígito verificador errado', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));

      await vet
        .post('/api/v1/receituario/tutores')
        .send({ nome: 'Marina Prado', cpf: '529.982.247-24' })
        .expect(400);
    });

    it('recusa telefone sem DDD', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));

      await vet
        .post('/api/v1/receituario/tutores')
        .send({ nome: 'Marina Prado', telefone: '98765-4321' })
        .expect(400);
    });

    /** Guardar com máscara faria "52998224725" e "529.982.247-25" virarem dois tutores. */
    it('guarda sem máscara e devolve com', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));

      const criado = await vet
        .post('/api/v1/receituario/tutores')
        .send({ nome: 'Marina Prado', cpf: CPF, telefone: '+55 11 98765-4321' })
        .expect(201);

      expect(criado.body.cpf).toBe('529.982.247-25');
      expect(criado.body.telefone).toBe('(11) 98765-4321');

      const noBanco = await prisma.tutor.findUniqueOrThrow({ where: { id: criado.body.id } });
      expect(noBanco.cpf).toBe('52998224725');
      expect(noBanco.telefone).toBe('11987654321');
    });

    it('recusa o mesmo CPF duas vezes, com resposta que explica', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await semearFicha(vet);

      const repetido = await vet
        .post('/api/v1/receituario/tutores')
        .send({ nome: 'Outra pessoa', cpf: '52998224725' })
        .expect(409);

      expect(repetido.body.message).toContain('CPF');
    });

    it('aceita ficha sem CPF — a consulta vem antes do documento', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));

      const criado = await vet
        .post('/api/v1/receituario/tutores')
        .send({ nome: 'Tutor sem documento' })
        .expect(201);

      expect(criado.body.cpf).toBeNull();
    });

    it('acha pelo CPF com ou sem máscara', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      await semearFicha(vet);

      for (const termo of ['529.982', '529982', 'marina']) {
        const achados = await vet
          .get(`/api/v1/receituario/tutores?busca=${encodeURIComponent(termo)}`)
          .expect(200);

        expect(achados.body.tutores).toHaveLength(1);
      }
    });
  });

  describe('paciente', () => {
    it('carimba a data de aferição quando o peso muda', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { pacienteId } = await semearFicha(vet, { pesoEmGramas: null });

      const semPeso = await vet.get(`/api/v1/receituario/pacientes/${pacienteId}`).expect(200);
      expect(semPeso.body.pesoEmGramas).toBeNull();
      expect(semPeso.body.pesoAferidoEm).toBeNull();

      const pesado = await vet
        .patch(`/api/v1/receituario/pacientes/${pacienteId}`)
        .send({ pesoEmGramas: 12_400 })
        .expect(200);

      expect(pesado.body.pesoEmGramas).toBe(12_400);
      expect(pesado.body.pesoAferidoEm).not.toBeNull();
    });

    /** Trinta quilos digitados no campo de gramas dariam uma dose mil vezes menor. */
    it('recusa peso fracionário e peso fora de escala', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { tutorId } = await semearFicha(vet);

      for (const pesoEmGramas of [12.5, 5_000_000, 0, -100]) {
        await vet
          .post('/api/v1/receituario/pacientes')
          .send({ tutorId, nome: 'Teste', especie: 'CANINO', pesoEmGramas })
          .expect(400);
      }
    });
  });

  // --- receita ---

  describe('rascunho', () => {
    it('nasce sem número, cotado, com a quantidade tirada da posologia', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { pacienteId } = await semearFicha(vet);

      const criada = await vet
        .post('/api/v1/receituario/receitas')
        .send({ pacienteId, formulacoes: [fórmula(capsulaId, gabapentinaId)] })
        .expect(201);

      expect(criada.body.numero).toBeNull();
      expect(criada.body.estado).toBe('RASCUNHO');
      expect(criada.body.situacao).toBe('rascunho');
      // 12 em 12 horas por 10 dias: duas doses por dia, vinte cápsulas.
      expect(criada.body.formulacoes[0].quantidade).toBe(20);
      expect(criada.body.valorTotalEmCentavos).toBeGreaterThan(0);
    });

    it('aceita a quantidade arredondada pelo veterinário', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { pacienteId } = await semearFicha(vet);

      const criada = await vet
        .post('/api/v1/receituario/receitas')
        .send({
          pacienteId,
          formulacoes: [{ ...fórmula(capsulaId, gabapentinaId), quantidade: 30 }],
        })
        .expect(201);

      expect(criada.body.formulacoes[0].quantidade).toBe(30);
    });

    it('avisa quando a dose sai da faixa da espécie', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      await prisma.faixaTerapeutica.create({
        data: {
          insumoId: gabapentinaId,
          especie: 'CANINO',
          doseMinimaEmMicrogramasPorKg: 10_000,
          doseMaximaEmMicrogramasPorKg: 20_000,
        },
      });

      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { pacienteId } = await semearFicha(vet);

      // 500 mg num cão de 12 kg é 41,7 mg/kg: o dobro do teto.
      const criada = await vet
        .post('/api/v1/receituario/receitas')
        .send({ pacienteId, formulacoes: [fórmula(capsulaId, gabapentinaId, 500)] })
        .expect(201);

      const avisos = criada.body.formulacoes[0].avisos;
      expect(avisos.some((a: { tipo: string }) => a.tipo === 'fora-da-faixa')).toBe(true);
    });

    it('avisa quando o tratamento passa da duração máxima', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      await prisma.faixaTerapeutica.create({
        data: {
          insumoId: gabapentinaId,
          especie: 'CANINO',
          doseMinimaEmMicrogramasPorKg: 1_000,
          doseMaximaEmMicrogramasPorKg: 100_000,
          duracaoMaximaEmDias: 7,
        },
      });

      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { pacienteId } = await semearFicha(vet);

      const criada = await vet
        .post('/api/v1/receituario/receitas')
        .send({ pacienteId, formulacoes: [fórmula(capsulaId, gabapentinaId)] })
        .expect(201);

      const avisos = criada.body.formulacoes[0].avisos;
      expect(avisos.some((a: { tipo: string }) => a.tipo === 'duracao-acima')).toBe(true);
    });

    it('regrava o rascunho por inteiro', async () => {
      const { capsulaId, gabapentinaId, amoxicilinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { pacienteId } = await semearFicha(vet);

      const criada = await vet
        .post('/api/v1/receituario/receitas')
        .send({ pacienteId, formulacoes: [fórmula(capsulaId, gabapentinaId)] })
        .expect(201);

      const regravada = await vet
        .put(`/api/v1/receituario/receitas/${criada.body.id}`)
        .send({ pacienteId, formulacoes: [fórmula(capsulaId, amoxicilinaId, 250)] })
        .expect(200);

      expect(regravada.body.formulacoes).toHaveLength(1);
      expect(regravada.body.formulacoes[0].itens[0].descricao).toBe('Amoxicilina');

      // A fórmula antiga sai do banco junto, e não fica órfã.
      const itens = await prisma.itemDaFormulacao.findMany();
      expect(itens).toHaveLength(1);
    });

    it('recusa o mesmo insumo duas vezes na mesma fórmula', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { pacienteId } = await semearFicha(vet);

      await vet
        .post('/api/v1/receituario/receitas')
        .send({
          pacienteId,
          formulacoes: [
            {
              formaId: capsulaId,
              frequenciaHoras: 12,
              dias: 10,
              itens: [
                { insumoId: gabapentinaId, doseMg: 100 },
                { insumoId: gabapentinaId, doseMg: 50 },
              ],
            },
          ],
        })
        .expect(400);
    });
  });

  describe('emissão', () => {
    async function rascunho(
      vet: Sessao,
      formulacoes: unknown[],
      opcoes: { cpf?: string | null; pesoEmGramas?: number | null } = {},
    ): Promise<string> {
      const { pacienteId } = await semearFicha(vet, opcoes);

      const criada = await vet
        .post('/api/v1/receituario/receitas')
        .send({ pacienteId, formulacoes })
        .expect(201);

      return criada.body.id;
    }

    it('numera, congela e passa a valer', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await rascunho(vet, [fórmula(capsulaId, gabapentinaId)]);

      const emitida = await vet.post(`/api/v1/receituario/receitas/${id}/emitir`).expect(200);

      expect(emitida.body.numero).toBe(1);
      expect(emitida.body.estado).toBe('EMITIDA');
      expect(emitida.body.situacao).toBe('valida');
      expect(emitida.body.crmv).toMatch(/^SP-/);
      expect(emitida.body.pesoDoPacienteEmGramas).toBe(12_000);

      // C1: trinta dias a contar da emissão.
      expect(emitida.body.prazoEmDias).toBe(30);
      const distancia =
        new Date(emitida.body.validaAte).getTime() - new Date(emitida.body.emitidaEm).getTime();
      expect(distancia).toBe(30 * 24 * 60 * 60 * 1000);
    });

    /** A folha é uma só: o item mais curto manda na receita inteira. */
    it('antimicrobiano junto com controlado encurta a receita para dez dias', async () => {
      const { capsulaId, gabapentinaId, amoxicilinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await rascunho(vet, [
        fórmula(capsulaId, gabapentinaId),
        fórmula(capsulaId, amoxicilinaId, 250),
      ]);

      const emitida = await vet.post(`/api/v1/receituario/receitas/${id}/emitir`).expect(200);

      expect(emitida.body.prazoEmDias).toBe(10);
      expect(emitida.body.prazoMotivo).toContain('ANTIMICROBIANO');
    });

    it('congela o que o cadastro pode mudar depois', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await rascunho(vet, [fórmula(capsulaId, gabapentinaId)]);

      const emitida = await vet.post(`/api/v1/receituario/receitas/${id}/emitir`).expect(200);
      const valorNaEmissao = emitida.body.valorTotalEmCentavos;
      expect(valorNaEmissao).toBeGreaterThan(0);

      // O catálogo é reimportado a cada export da farmácia: descrição corrigida,
      // custo novo. Nada disso pode reescrever o que já foi assinado.
      await prisma.insumo.update({
        where: { id: gabapentinaId },
        data: { descricao: 'Gabapentina 100% (corrigido)', custoPorGramaEmMicro: 70_000 },
      });
      await prisma.formaFarmaceutica.update({
        where: { id: capsulaId },
        data: { nome: 'CÁPSULAS GELATINOSAS' },
      });

      const relida = await vet.get(`/api/v1/receituario/receitas/${id}`).expect(200);

      expect(relida.body.valorTotalEmCentavos).toBe(valorNaEmissao);
      expect(relida.body.formulacoes[0].forma).toBe('CÁPSULAS');
      expect(relida.body.formulacoes[0].itens[0].descricao).toBe('Gabapentina');
    });

    it('recusa emitir sem CRMV', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO', { crmv: null }));
      const id = await rascunho(vet, [fórmula(capsulaId, gabapentinaId)]);

      const recusa = await vet.post(`/api/v1/receituario/receitas/${id}/emitir`).expect(400);
      expect(recusa.body.message).toContain('CRMV');
    });

    it('recusa emitir sem peso do paciente', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await rascunho(vet, [fórmula(capsulaId, gabapentinaId)], { pesoEmGramas: null });

      const recusa = await vet.post(`/api/v1/receituario/receitas/${id}/emitir`).expect(400);
      expect(recusa.body.message).toContain('peso');
    });

    it('recusa emitir o que a farmácia não manipula naquela forma', async () => {
      const { pastaId, gabapentinaId } = await semearCatalogo();
      await prisma.restricaoDeForma.create({
        data: { insumoId: gabapentinaId, formaId: pastaId, motivo: 'não faz em pasta' },
      });

      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await rascunho(vet, [fórmula(pastaId, gabapentinaId)]);

      const recusa = await vet.post(`/api/v1/receituario/receitas/${id}/emitir`).expect(400);
      expect(recusa.body.message).toContain('pasta');
    });

    /**
     * Lista nova na portaria, ou erro de digitação no catálogo. O prazo padrão
     * é de seis meses, e aplicá-lo a um controlado desconhecido seria o pior
     * erro possível — parar é mais barato.
     */
    it('recusa emitir com lista de controle que o sistema não conhece', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      await prisma.insumo.update({
        where: { id: gabapentinaId },
        data: { listaDeControle: 'C9' },
      });

      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await rascunho(vet, [fórmula(capsulaId, gabapentinaId)]);

      const recusa = await vet.post(`/api/v1/receituario/receitas/${id}/emitir`).expect(400);
      expect(recusa.body.message).toContain('C9');
    });

    it('não emite duas vezes, e não deixa alterar depois de emitida', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { pacienteId } = await semearFicha(vet);

      const criada = await vet
        .post('/api/v1/receituario/receitas')
        .send({ pacienteId, formulacoes: [fórmula(capsulaId, gabapentinaId)] })
        .expect(201);

      await vet.post(`/api/v1/receituario/receitas/${criada.body.id}/emitir`).expect(200);
      await vet.post(`/api/v1/receituario/receitas/${criada.body.id}/emitir`).expect(400);

      const alteracao = await vet
        .put(`/api/v1/receituario/receitas/${criada.body.id}`)
        .send({ pacienteId, formulacoes: [fórmula(capsulaId, gabapentinaId, 50)] })
        .expect(400);

      expect(alteracao.body.message).toContain('Cancele');
    });

    it('dá um número distinto a cada emissão', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const vet = autenticado(await entrarComo('VETERINARIO'));

      const numeros: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const id = await rascunho(vet, [fórmula(capsulaId, gabapentinaId)], { cpf: null });
        const emitida = await vet.post(`/api/v1/receituario/receitas/${id}/emitir`).expect(200);
        numeros.push(emitida.body.numero);
      }

      expect(new Set(numeros).size).toBe(3);
      expect(numeros).toEqual([...numeros].sort((a, b) => a - b));
    });

    it('registra a emissão na auditoria', async () => {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const credenciais = await entrarComo('VETERINARIO');
      const vet = autenticado(credenciais);
      const id = await rascunho(vet, [fórmula(capsulaId, gabapentinaId)]);

      await vet.post(`/api/v1/receituario/receitas/${id}/emitir`).expect(200);

      const evento = await prisma.eventoDeAuditoria.findFirst({
        where: { acao: 'RECEITA_EMITIDA' },
      });

      expect(evento).not.toBeNull();
      expect(evento!.usuarioId).toBe(credenciais.id);
      expect(evento!.alvo).toBe(`receita:${id}`);
    });
  });

  describe('cancelamento', () => {
    async function emitida(vet: Sessao): Promise<string> {
      const { capsulaId, gabapentinaId } = await semearCatalogo();
      const { pacienteId } = await semearFicha(vet);

      const criada = await vet
        .post('/api/v1/receituario/receitas')
        .send({ pacienteId, formulacoes: [fórmula(capsulaId, gabapentinaId)] })
        .expect(201);

      await vet.post(`/api/v1/receituario/receitas/${criada.body.id}/emitir`).expect(200);

      return criada.body.id;
    }

    it('exige motivo', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await emitida(vet);

      await vet.post(`/api/v1/receituario/receitas/${id}/cancelar`).send({}).expect(400);
      await vet.post(`/api/v1/receituario/receitas/${id}/cancelar`).send({ motivo: 'x' }).expect(400);
    });

    it('cancela, guarda o motivo e registra', async () => {
      const credenciais = await entrarComo('VETERINARIO');
      const vet = autenticado(credenciais);
      const id = await emitida(vet);

      const cancelada = await vet
        .post(`/api/v1/receituario/receitas/${id}/cancelar`)
        .send({ motivo: 'Dose corrigida após nova pesagem.' })
        .expect(200);

      expect(cancelada.body.estado).toBe('CANCELADA');
      expect(cancelada.body.situacao).toBe('cancelada');
      expect(cancelada.body.motivoDoCancelamento).toContain('nova pesagem');
      // O número permanece: a receita cancelada continua existindo, numerada.
      expect(cancelada.body.numero).toBe(1);

      const evento = await prisma.eventoDeAuditoria.findFirst({
        where: { acao: 'RECEITA_CANCELADA' },
      });
      expect(evento).not.toBeNull();
    });

    it('não cancela duas vezes', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await emitida(vet);

      await vet
        .post(`/api/v1/receituario/receitas/${id}/cancelar`)
        .send({ motivo: 'Erro na dose.' })
        .expect(200);

      await vet
        .post(`/api/v1/receituario/receitas/${id}/cancelar`)
        .send({ motivo: 'De novo.' })
        .expect(400);
    });

    it('a farmácia lê, mas não desfaz o que um veterinário assinou', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await emitida(vet);

      const farmacia = autenticado(await entrarComo('FARMACIA'));
      await farmacia.get(`/api/v1/receituario/receitas/${id}`).expect(200);
      await farmacia
        .post(`/api/v1/receituario/receitas/${id}/cancelar`)
        .send({ motivo: 'Não quero manipular.' })
        .expect(403);
    });

    it('a administração cancela a receita de qualquer um', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const id = await emitida(vet);

      const admin = autenticado(await entrarComo('ADMIN'));
      await admin
        .post(`/api/v1/receituario/receitas/${id}/cancelar`)
        .send({ motivo: 'Pedido do conselho.' })
        .expect(200);
    });
  });
});
