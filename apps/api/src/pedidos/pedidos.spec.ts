import type { INestApplication } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import { IdentidadeService } from '../identidade/identidade.service';
import { CABECALHO_CSRF, COOKIE_CSRF, COOKIE_SESSAO } from '../identidade/requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';

describe('pedidos (contra Postgres)', () => {
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

  /**
   * Uma receita emitida, com tutor endereçado. É o ponto de partida de todo
   * teste daqui.
   */
  async function receitaEmitida(
    sessao: Sessao,
    opcoes: { comEnderecoDoTutor?: boolean } = {},
  ): Promise<{ id: string; numero: number }> {
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

    const endereco =
      opcoes.comEnderecoDoTutor === false
        ? {}
        : {
            cep: '05422-010',
            logradouro: 'Rua das Acácias',
            numero: '120',
            bairro: 'Pinheiros',
            cidade: 'São Paulo',
            uf: 'SP',
          };

    const tutor = await sessao
      .post('/api/v1/receituario/tutores')
      .send({ nome: 'Marina Prado', telefone: '(11) 98765-4321', ...endereco })
      .expect(201);

    const paciente = await sessao
      .post('/api/v1/receituario/pacientes')
      .send({ tutorId: tutor.body.id, nome: 'Tobias', especie: 'CANINO', pesoEmGramas: 12_000 })
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

    return { id: emitida.body.id, numero: emitida.body.numero };
  }

  async function pedidoEnviado(vet: Sessao): Promise<{ id: string; receitaId: string }> {
    const receita = await receitaEmitida(vet);
    const pedido = await vet
      .post('/api/v1/pedidos')
      .send({ receitaId: receita.id, destino: 'TUTOR' })
      .expect(201);

    return { id: pedido.body.id, receitaId: receita.id };
  }

  // --- envio ---

  describe('enviar à farmácia', () => {
    it('nasce em análise, com o endereço do tutor congelado', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const receita = await receitaEmitida(vet);

      const pedido = await vet
        .post('/api/v1/pedidos')
        .send({ receitaId: receita.id, destino: 'TUTOR', observacoes: 'Cliente tem pressa.' })
        .expect(201);

      expect(pedido.body.estado).toBe('EM_ANALISE');
      expect(pedido.body.numero).toEqual(expect.any(Number));
      expect(pedido.body.enderecoDeEntrega).toContain('Marina Prado');
      expect(pedido.body.enderecoDeEntrega).toContain('Rua das Acácias, 120');
      expect(pedido.body.observacoes).toBe('Cliente tem pressa.');
      expect(pedido.body.receitaNumero).toBe(receita.numero);
    });

    it('recusa rascunho — só receita válida vira manipulação', async () => {
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
        .send({ nome: 'Marina Prado', cidade: 'São Paulo', uf: 'SP' })
        .expect(201);
      const paciente = await vet
        .post('/api/v1/receituario/pacientes')
        .send({ tutorId: tutor.body.id, nome: 'Tobias', especie: 'CANINO', pesoEmGramas: 12_000 })
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

      const recusa = await vet
        .post('/api/v1/pedidos')
        .send({ receitaId: rascunho.body.id, destino: 'TUTOR' })
        .expect(400);

      expect(recusa.body.message).toContain('válida');
    });

    it('recusa receita cancelada', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const receita = await receitaEmitida(vet);
      await vet
        .post(`/api/v1/receituario/receitas/${receita.id}/cancelar`)
        .send({ motivo: 'Dose revista.' })
        .expect(200);

      await vet
        .post('/api/v1/pedidos')
        .send({ receitaId: receita.id, destino: 'TUTOR' })
        .expect(400);
    });

    it('recusa o segundo pedido da mesma receita', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const receita = await receitaEmitida(vet);

      await vet
        .post('/api/v1/pedidos')
        .send({ receitaId: receita.id, destino: 'TUTOR' })
        .expect(201);

      // Dois cliques no botão não podem virar duas manipulações do mesmo
      // controlado.
      const segundo = await vet
        .post('/api/v1/pedidos')
        .send({ receitaId: receita.id, destino: 'TUTOR' })
        .expect(409);

      expect(segundo.body.message).toContain('em andamento');
    });

    it('depois de cancelado, a mesma receita pode ser enviada de novo', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const { id: pedidoId, receitaId } = await pedidoEnviado(vet);

      await farmacia
        .post(`/api/v1/pedidos/${pedidoId}/estado`)
        .send({ estado: 'CANCELADO', motivo: 'Tutor desistiu.' })
        .expect(200);

      await vet.post('/api/v1/pedidos').send({ receitaId, destino: 'TUTOR' }).expect(201);
    });

    it('recusa entregar no tutor sem endereço, em vez de gravar destino vazio', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const receita = await receitaEmitida(vet, { comEnderecoDoTutor: false });

      const recusa = await vet
        .post('/api/v1/pedidos')
        .send({ receitaId: receita.id, destino: 'TUTOR' })
        .expect(400);

      expect(recusa.body.message).toContain('sem endereço');
    });

    it('recusa entregar na clínica quando a receita não saiu por uma', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const receita = await receitaEmitida(vet);

      const recusa = await vet
        .post('/api/v1/pedidos')
        .send({ receitaId: receita.id, destino: 'CLINICA' })
        .expect(400);

      expect(recusa.body.message).toContain('clínica');
    });

    it('recusa FARMACIA enviando — quem manda é quem prescreve', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const receita = await receitaEmitida(vet);

      await farmacia
        .post('/api/v1/pedidos')
        .send({ receitaId: receita.id, destino: 'TUTOR' })
        .expect(403);
    });
  });

  // --- fila e visibilidade ---

  describe('a fila', () => {
    it('a farmácia vê o pedido de qualquer veterinário', async () => {
      const ana = autenticado(await entrarComo('VETERINARIO'));
      const bruno = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));

      await pedidoEnviado(ana);
      await pedidoEnviado(bruno);

      const fila = await farmacia.get('/api/v1/pedidos').expect(200);
      expect(fila.body.pedidos).toHaveLength(2);
    });

    it('um veterinário não vê o pedido do outro', async () => {
      const ana = autenticado(await entrarComo('VETERINARIO'));
      const bruno = autenticado(await entrarComo('VETERINARIO'));
      const { id } = await pedidoEnviado(ana);

      const fila = await bruno.get('/api/v1/pedidos').expect(200);
      expect(fila.body.pedidos).toHaveLength(0);

      // 404 e não 403: 403 confirmaria que aquele pedido existe.
      await bruno.get(`/api/v1/pedidos/${id}`).expect(404);
    });

    it('vem por ordem de chegada, que é como a bancada trabalha', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));

      const primeiro = await pedidoEnviado(vet);
      const segundo = await pedidoEnviado(vet);

      const fila = await farmacia.get('/api/v1/pedidos').expect(200);
      expect(fila.body.pedidos.map((p: { id: string }) => p.id)).toEqual([primeiro.id, segundo.id]);
    });

    it('filtra o que ainda anda', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));

      const vivo = await pedidoEnviado(vet);
      const morto = await pedidoEnviado(vet);
      await farmacia
        .post(`/api/v1/pedidos/${morto.id}/estado`)
        .send({ estado: 'CANCELADO', motivo: 'Duplicado.' })
        .expect(200);

      const abertos = await farmacia.get('/api/v1/pedidos?emAberto=true').expect(200);
      expect(abertos.body.pedidos.map((p: { id: string }) => p.id)).toEqual([vivo.id]);
    });
  });

  // --- andamento ---

  describe('andamento', () => {
    it('percorre análise, produção, pronto e entregue, marcando as horas', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const { id } = await pedidoEnviado(vet);

      const producao = await farmacia
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'EM_PRODUCAO' })
        .expect(200);
      expect(producao.body.producaoEm).toEqual(expect.any(String));

      const pronto = await farmacia
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'PRONTO' })
        .expect(200);
      expect(pronto.body.prontoEm).toEqual(expect.any(String));
      // Cada marco guarda a própria hora: sobrescrever um campo só perderia
      // quanto tempo o pedido passou em cada etapa.
      expect(pronto.body.producaoEm).toBe(producao.body.producaoEm);

      const entregue = await farmacia
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'ENTREGUE' })
        .expect(200);
      expect(entregue.body.entregueEm).toEqual(expect.any(String));
    });

    it('não pula etapas', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const { id } = await pedidoEnviado(vet);

      const recusa = await farmacia
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'ENTREGUE' })
        .expect(400);

      expect(recusa.body.message).toContain('não pode ir para');
    });

    it('entregue é final, nem para cancelar', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const { id } = await pedidoEnviado(vet);

      for (const estado of ['EM_PRODUCAO', 'PRONTO', 'ENTREGUE'] as const) {
        await farmacia.post(`/api/v1/pedidos/${id}/estado`).send({ estado }).expect(200);
      }

      // O remédio já está com o tutor. Um pedido que volta de entregue é um
      // histórico que mente sobre o que aconteceu.
      await farmacia
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'CANCELADO', motivo: 'Erro de digitação.' })
        .expect(400);
    });

    it('cancelar exige motivo', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const { id } = await pedidoEnviado(vet);

      const recusa = await farmacia
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'CANCELADO' })
        .expect(400);

      expect(recusa.body.message).toContain('por que');
    });

    it('quem prescreve cancela enquanto está em análise', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { id } = await pedidoEnviado(vet);

      await vet
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'CANCELADO', motivo: 'Tutor desistiu.' })
        .expect(200);
    });

    it('quem prescreve não move o pedido para produção', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const { id } = await pedidoEnviado(vet);

      const recusa = await vet
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'EM_PRODUCAO' })
        .expect(400);

      expect(recusa.body.message).toContain('farmácia');
    });

    it('quem prescreve não cancela depois de a farmácia começar', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const { id } = await pedidoEnviado(vet);

      await farmacia
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'EM_PRODUCAO' })
        .expect(200);

      // Já há insumo pesado do outro lado: desistir vira conversa, não botão.
      await vet
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'CANCELADO', motivo: 'Mudei de ideia.' })
        .expect(400);
    });

    it('registra na auditoria quem moveu e para onde', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const credenciais = await entrarComo('FARMACIA');
      const farmacia = autenticado(credenciais);
      const { id } = await pedidoEnviado(vet);

      await farmacia
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'EM_PRODUCAO' })
        .expect(200);

      const eventos = await prisma.eventoDeAuditoria.findMany({
        where: { acao: 'PEDIDO_MUDOU_DE_ESTADO' },
      });

      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.usuarioId).toBe(credenciais.id);
      expect(eventos[0]?.detalhe).toMatchObject({ de: 'EM_ANALISE', para: 'EM_PRODUCAO' });
    });

    it('a receita não muda quando o pedido anda', async () => {
      const vet = autenticado(await entrarComo('VETERINARIO'));
      const farmacia = autenticado(await entrarComo('FARMACIA'));
      const { id, receitaId } = await pedidoEnviado(vet);

      const antes = await vet.get(`/api/v1/receituario/receitas/${receitaId}`).expect(200);
      await farmacia
        .post(`/api/v1/pedidos/${id}/estado`)
        .send({ estado: 'EM_PRODUCAO' })
        .expect(200);
      const depois = await vet.get(`/api/v1/receituario/receitas/${receitaId}`).expect(200);

      // O documento é imutável: quem anda é o pedido.
      expect(depois.body).toEqual(antes.body);
    });
  });
});
