import type { INestApplication } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import { IdentidadeService } from '../identidade/identidade.service';
import { CABECALHO_CSRF, COOKIE_CSRF, COOKIE_SESSAO } from '../identidade/requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';

describe('catálogo (contra Postgres)', () => {
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
      'TRUNCATE TABLE "restricao_de_forma", "faixa_terapeutica", "insumo", "forma_farmaceutica", "condicoes_comerciais" CASCADE',
    );
    http = cliente(app);
  });

  async function entrarComo(papel: Papel): Promise<{ sessao: string; csrf: string }> {
    const email = `${papel.toLowerCase()}@clinica.test`;
    await app
      .get(IdentidadeService)
      .criarUsuario({ email, nome: 'Fulano', papel, senha: SENHA }, { id: null });

    const resposta = await http
      .post('/api/v1/auth/entrar')
      .send({ email, senha: SENHA })
      .expect(204);

    return { sessao: cookieDa(resposta, COOKIE_SESSAO), csrf: cookieDa(resposta, COOKIE_CSRF) };
  }

  function autenticado(credenciais: { sessao: string; csrf: string }) {
    return {
      get: (caminho: string) =>
        http.get(caminho).set('Cookie', `${COOKIE_SESSAO}=${credenciais.sessao}`),
      post: (caminho: string) =>
        http
          .post(caminho)
          .set('Cookie', `${COOKIE_SESSAO}=${credenciais.sessao}`)
          .set(CABECALHO_CSRF, credenciais.csrf),
      patch: (caminho: string) =>
        http
          .patch(caminho)
          .set('Cookie', `${COOKIE_SESSAO}=${credenciais.sessao}`)
          .set(CABECALHO_CSRF, credenciais.csrf),
      delete: (caminho: string) =>
        http
          .delete(caminho)
          .set('Cookie', `${COOKIE_SESSAO}=${credenciais.sessao}`)
          .set(CABECALHO_CSRF, credenciais.csrf),
    };
  }

  async function semearCatalogo(): Promise<{
    insumoId: string;
    formaId: string;
    biscoitoId: string;
  }> {
    const forma = await prisma.formaFarmaceutica.create({ data: { nome: 'CÁPSULAS' } });
    const biscoito = await prisma.formaFarmaceutica.create({ data: { nome: 'BISCOITOS' } });
    const insumo = await prisma.insumo.create({
      data: {
        codigo: '665',
        descricao: 'Gabapentina',
        custoPorGramaEmMicro: 35_120,
        markupEmCentesimos: 648,
        estoqueEmMiligramas: 500_000,
      },
    });

    return { insumoId: insumo.id, formaId: forma.id, biscoitoId: biscoito.id };
  }

  describe('acesso', () => {
    it('recusa a busca de insumo para quem não entrou', async () => {
      await http.get('/api/v1/catalogo/insumos').expect(401);
    });

    it.each(['VETERINARIO', 'FARMACIA'] as const)('recusa %s cadastrando insumo', async (papel) => {
      const sessao = autenticado(await entrarComo(papel));

      await sessao
        .post('/api/v1/catalogo/insumos')
        .send({
          codigo: 'x',
          descricao: 'Qualquer coisa',
          custoPorGramaEmMicro: 1,
          markupEmCentesimos: 100,
        })
        .expect(403);

      expect(await prisma.insumo.count()).toBe(0);
    });

    it('deixa o administrador cadastrar insumo', async () => {
      const sessao = autenticado(await entrarComo('ADMIN'));

      const resposta = await sessao
        .post('/api/v1/catalogo/insumos')
        .send({
          codigo: '665',
          descricao: 'Gabapentina',
          custoPorGramaEmMicro: 35_120,
          markupEmCentesimos: 648,
          estoqueEmMiligramas: 500_000,
        })
        .expect(201);

      expect(resposta.body).toMatchObject({ codigo: '665', estoque: 'disponivel' });
    });
  });

  /**
   * A farmácia decidiu que custo, markup e desconto não aparecem para quem
   * prescreve nem para o tutor. Esconder na tela não bastaria: o que chega ao
   * navegador é visível para quem abrir o inspetor — foi assim que a v1 vazou
   * o papel do usuário dentro do token.
   */
  describe('o custo não trafega até o prescritor', () => {
    it('devolve só o valor final no orçamento', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(200);

      expect(Object.keys(resposta.body).sort()).toEqual([
        'avisos',
        'forma',
        'impedimentos',
        'valorFinalEmCentavos',
      ]);
    });

    it('não deixa markup, custo nem desconto vazarem em nenhum campo', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      await prisma.condicoesComerciais.create({
        data: { id: 'padrao', descontoEmPontosBase: 4_000, taxaDeManipulacaoEmCentavos: 4_500 },
      });
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(200);

      const corpo = JSON.stringify(resposta.body);
      for (const proibido of ['markup', 'custo', 'desconto', 'subtotal', 'materiaPrima']) {
        expect(corpo.toLowerCase()).not.toContain(proibido.toLowerCase());
      }
    });

    it('também esconde o custo na busca de insumo', async () => {
      await semearCatalogo();
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao.get('/api/v1/catalogo/insumos').expect(200);

      const corpo = JSON.stringify(resposta.body);
      expect(corpo).not.toContain('35120');
      expect(corpo).not.toContain('648');
      // Estoque vira situação: o número exato é informação comercial.
      expect(corpo).not.toContain('500000');
      expect(resposta.body.insumos[0]).toMatchObject({ estoque: 'disponivel' });
    });

    it('recusa o orçamento detalhado para o prescritor', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      await sessao
        .post('/api/v1/catalogo/orcamento/detalhado')
        .send({ formaId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(403);
    });

    it('abre a composição para quem opera a farmácia', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('FARMACIA'));

      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento/detalhado')
        .send({ formaId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(200);

      expect(resposta.body.itens[0]).toMatchObject({ insumoId, massaTotalEmMiligramas: 1_500 });
      expect(resposta.body.totalDeMateriaPrimaEmCentavos).toBe(34);
    });
  });

  describe('orçamento', () => {
    it('calcula o preço da formulação', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(200);

      expect(resposta.body).toMatchObject({ valorFinalEmCentavos: 34, forma: 'CÁPSULAS' });
    });

    it('usa as condições comerciais gravadas pelo administrador', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      const admin = autenticado(await entrarComo('ADMIN'));

      await admin
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(200);

      await prisma.condicoesComerciais.update({
        where: { id: 'padrao' },
        data: { taxaDeManipulacaoEmCentavos: 4_500 },
      });

      const resposta = await admin
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(200);

      // 34 centavos de matéria-prima + R$ 45,00 de taxa
      expect(resposta.body.valorFinalEmCentavos).toBe(4_534);
    });

    it('cobra o adicional de biscoito quando a forma é biscoito', async () => {
      const { insumoId, formaId, biscoitoId } = await semearCatalogo();
      await prisma.condicoesComerciais.create({
        data: { id: 'padrao', adicionalDeBiscoitoEmCentavos: 2_000 },
      });
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const capsulas = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(200);
      const biscoitos = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId: biscoitoId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(200);

      expect(biscoitos.body.valorFinalEmCentavos - capsulas.body.valorFinalEmCentavos).toBe(2_000);
    });

    it('bloqueia e não precifica insumo proibido na forma', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      await prisma.restricaoDeForma.create({
        data: { insumoId, formaId, motivo: 'Higroscópico demais para cápsula.' },
      });
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId, doseMg: 25, quantidade: 60 }] })
        .expect(200);

      expect(resposta.body.impedimentos).toHaveLength(1);
      expect(resposta.body.impedimentos[0].insumoId).toBe(insumoId);
      // Sem preço: mostrar um valor ao lado do impedimento convidaria a tela a
      // exibi-lo, e a fórmula não pode ser feita.
      expect(resposta.body.valorFinalEmCentavos).toBe(0);
    });

    it('avisa do controlado nomeando a lista', async () => {
      const { formaId } = await semearCatalogo();
      const controlado = await prisma.insumo.create({
        data: {
          codigo: '412',
          descricao: 'Tramadol',
          custoPorGramaEmMicro: 10_000,
          markupEmCentesimos: 500,
          estoqueEmMiligramas: 100_000,
          controlado: true,
          listaDeControle: 'A2',
        },
      });
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId: controlado.id, doseMg: 4, quantidade: 60 }] })
        .expect(200);

      expect(resposta.body.avisos[0]).toMatchObject({
        tipo: 'controlado',
        insumoId: controlado.id,
      });
      expect(resposta.body.avisos[0].texto).toContain('lista A2');
    });

    it('recusa fórmula com o mesmo insumo duas vezes', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({
          formaId,
          itens: [
            { insumoId, doseMg: 25, quantidade: 60 },
            { insumoId, doseMg: 10, quantidade: 60 },
          ],
        })
        .expect(400);
    });

    it('recusa forma que não existe', async () => {
      const { insumoId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({
          formaId: '2b1f6a6e-2d5e-4a0e-9f0e-9c7b2b1f6a6e',
          itens: [{ insumoId, doseMg: 25, quantidade: 60 }],
        })
        .expect(404);
    });

    it('recusa dose com mais de três casas decimais', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId, doseMg: 0.0001, quantidade: 60 }] })
        .expect(400);
    });
  });

  describe('faixa terapêutica', () => {
    async function comFaixaFelina(insumoId: string): Promise<void> {
      await prisma.faixaTerapeutica.create({
        data: {
          insumoId,
          especie: 'FELINO',
          doseMinimaEmMicrogramasPorKg: 5_000,
          doseMaximaEmMicrogramasPorKg: 10_000,
        },
      });
    }

    it('avisa quando a dose passa do máximo da espécie', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      await comFaixaFelina(insumoId);
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      // Gato de 4 kg com 60 mg = 15 mg/kg. Normal em cão, demais em gato.
      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({
          formaId,
          itens: [{ insumoId, doseMg: 60, quantidade: 60 }],
          paciente: { especie: 'FELINO', pesoEmGramas: 4_000 },
        })
        .expect(200);

      const fora = resposta.body.avisos.find(
        (a: { tipo: string }) => a.tipo === 'fora-da-faixa',
      ) as { texto: string } | undefined;
      expect(fora?.texto).toContain('acima do máximo de 10 mg/kg');
    });

    it('fica quieto quando a dose está na faixa', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      await comFaixaFelina(insumoId);
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({
          formaId,
          itens: [{ insumoId, doseMg: 30, quantidade: 60 }],
          paciente: { especie: 'FELINO', pesoEmGramas: 4_000 },
        })
        .expect(200);

      expect(resposta.body.avisos).toHaveLength(0);
    });

    /** Aprovar em silêncio o que não se sabe conferir é pior do que não conferir. */
    it('diz que não tem referência, em vez de aprovar calado', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      await comFaixaFelina(insumoId);
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({
          formaId,
          itens: [{ insumoId, doseMg: 30, quantidade: 60 }],
          paciente: { especie: 'CANINO', pesoEmGramas: 12_000 },
        })
        .expect(200);

      expect(resposta.body.avisos[0]?.tipo).toBe('sem-referencia');
    });

    it('não confere nada quando o paciente não é informado', async () => {
      const { insumoId, formaId } = await semearCatalogo();
      await comFaixaFelina(insumoId);
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao
        .post('/api/v1/catalogo/orcamento')
        .send({ formaId, itens: [{ insumoId, doseMg: 60, quantidade: 60 }] })
        .expect(200);

      expect(resposta.body.avisos).toHaveLength(0);
    });
  });

  describe('busca de insumo', () => {
    it('encontra por trecho do nome, sem diferenciar maiúsculas', async () => {
      await semearCatalogo();
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao.get('/api/v1/catalogo/insumos?busca=gabap').expect(200);

      expect(resposta.body.insumos).toHaveLength(1);
    });

    it('encontra pelo código da farmácia', async () => {
      await semearCatalogo();
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao.get('/api/v1/catalogo/insumos?busca=665').expect(200);

      expect(resposta.body.insumos[0]?.codigo).toBe('665');
    });

    it('não lista insumo desativado', async () => {
      const { insumoId } = await semearCatalogo();
      await prisma.insumo.update({ where: { id: insumoId }, data: { desativadoEm: new Date() } });
      const sessao = autenticado(await entrarComo('VETERINARIO'));

      const resposta = await sessao.get('/api/v1/catalogo/insumos').expect(200);

      expect(resposta.body.insumos).toHaveLength(0);
    });
  });

  /**
   * Controlado sem lista de controle não é cadastro pela metade: é prazo
   * errado. `prazoDaReceita` decide a validade pela lista de cada item, e lista
   * nula cai no prazo padrão — 180 dias. Um entorpecente marcado como
   * controlado e sem lista ganharia seis meses de validade, calado, em vez dos
   * trinta dias da Portaria 344/98.
   */
  describe('controlado exige a lista', () => {
    it('recusa cadastrar controlado sem lista', async () => {
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao
        .post('/api/v1/catalogo/insumos')
        .send({
          codigo: '559',
          descricao: 'Diazepam',
          custoPorGramaEmMicro: 1_000,
          markupEmCentesimos: 648,
          controlado: true,
        })
        .expect(400);

      expect(await prisma.insumo.count()).toBe(0);
    });

    it('recusa marcar como controlado sem dizer a lista', async () => {
      const { insumoId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao
        .patch(`/api/v1/catalogo/insumos/${insumoId}`)
        .send({ controlado: true })
        .expect(400);

      const depois = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
      expect(depois.controlado).toBe(false);
    });

    /** O mesmo estado inválido, chegando por outro caminho. */
    it('recusa apagar a lista de quem já é controlado', async () => {
      const { insumoId } = await semearCatalogo();
      await prisma.insumo.update({
        where: { id: insumoId },
        data: { controlado: true, listaDeControle: 'C1' },
      });
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao
        .patch(`/api/v1/catalogo/insumos/${insumoId}`)
        .send({ listaDeControle: null })
        .expect(400);

      const depois = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
      expect(depois.listaDeControle).toBe('C1');
    });

    it('aceita quando a lista vem junto, e a guarda em maiúsculas', async () => {
      const { insumoId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('ADMIN'));

      const resposta = await sessao
        .patch(`/api/v1/catalogo/insumos/${insumoId}`)
        .send({ controlado: true, listaDeControle: 'c1' })
        .expect(200);

      expect(resposta.body).toMatchObject({ controlado: true, listaDeControle: 'C1' });
    });

    /** Lista órfã voltaria a valer inteira se alguém remarcasse o controlado. */
    it('limpa a lista ao deixar de ser controlado', async () => {
      const { insumoId } = await semearCatalogo();
      await prisma.insumo.update({
        where: { id: insumoId },
        data: { controlado: true, listaDeControle: 'C1' },
      });
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao
        .patch(`/api/v1/catalogo/insumos/${insumoId}`)
        .send({ controlado: false })
        .expect(200);

      const depois = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
      expect(depois.listaDeControle).toBeNull();
    });
  });

  describe('correção do catálogo', () => {
    it.each(['VETERINARIO', 'FARMACIA'] as const)('recusa %s alterando insumo', async (papel) => {
      const { insumoId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo(papel));

      await sessao
        .patch(`/api/v1/catalogo/insumos/${insumoId}`)
        .send({ markupEmCentesimos: 1 })
        .expect(403);
    });

    it('altera só o que veio, e deixa o resto como estava', async () => {
      const { insumoId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao
        .patch(`/api/v1/catalogo/insumos/${insumoId}`)
        .send({ markupEmCentesimos: 700 })
        .expect(200);

      const depois = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
      expect(depois.markupEmCentesimos).toBe(700);
      expect(depois.descricao).toBe('Gabapentina');
      expect(depois.custoPorGramaEmMicro).toBe(35_120);
    });

    /** Markup zero virava preço zero em silêncio — corrigido na fase 3. */
    it('não deixa zerar o markup pela correção', async () => {
      const { insumoId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao
        .patch(`/api/v1/catalogo/insumos/${insumoId}`)
        .send({ markupEmCentesimos: 0 })
        .expect(400);
    });

    it('404 em insumo que não existe, em vez de criar um', async () => {
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao
        .patch('/api/v1/catalogo/insumos/3f2a1b4c-0000-4000-8000-000000000000')
        .send({ descricao: 'Inventada' })
        .expect(404);

      expect(await prisma.insumo.count()).toBe(0);
    });

    /**
     * O importador chuta `aceitaAroma` a partir do nome, porque o arquivo da
     * farmácia traz só nomes. Sem esta rota, corrigir o chute exigia banco.
     */
    it('deixa o administrador corrigir se a forma aceita aroma', async () => {
      const { formaId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('ADMIN'));

      const resposta = await sessao
        .patch(`/api/v1/catalogo/formas/${formaId}`)
        .send({ aceitaAroma: true })
        .expect(200);

      expect(resposta.body).toMatchObject({ nome: 'CÁPSULAS', aceitaAroma: true });
    });

    it('desativa a forma sem apagá-la, e some da lista de quem prescreve', async () => {
      const { formaId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao
        .patch(`/api/v1/catalogo/formas/${formaId}`)
        .send({ desativada: true })
        .expect(200);

      const lista = await sessao.get('/api/v1/catalogo/formas').expect(200);
      expect(lista.body.formas.map((f: { nome: string }) => f.nome)).not.toContain('CÁPSULAS');
      expect(await prisma.formaFarmaceutica.count()).toBe(2);
    });

    /** Reenviar o mesmo corpo não pode apagar quando a forma saiu de linha. */
    it('não move a data ao desativar duas vezes', async () => {
      const { formaId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao.patch(`/api/v1/catalogo/formas/${formaId}`).send({ desativada: true });
      const primeira = await prisma.formaFarmaceutica.findUniqueOrThrow({ where: { id: formaId } });

      await sessao.patch(`/api/v1/catalogo/formas/${formaId}`).send({ desativada: true });
      const segunda = await prisma.formaFarmaceutica.findUniqueOrThrow({ where: { id: formaId } });

      expect(segunda.desativadaEm).toEqual(primeira.desativadaEm);
    });

    it('levanta uma proibição, e a forma volta a ser orçável', async () => {
      const { insumoId, biscoitoId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('ADMIN'));
      await sessao
        .post('/api/v1/catalogo/restricoes')
        .send({ insumoId, formaId: biscoitoId, motivo: 'Não se manipula em biscoito.' })
        .expect(204);

      await sessao.delete(`/api/v1/catalogo/restricoes/${insumoId}/${biscoitoId}`).expect(204);

      expect(await prisma.restricaoDeForma.count()).toBe(0);
    });

    /** Apagar o que não existe "dar certo" esconderia id errado. */
    it('404 ao levantar proibição que não está cadastrada', async () => {
      const { insumoId, biscoitoId } = await semearCatalogo();
      const sessao = autenticado(await entrarComo('ADMIN'));

      await sessao.delete(`/api/v1/catalogo/restricoes/${insumoId}/${biscoitoId}`).expect(404);
    });

    it.each(['VETERINARIO', 'FARMACIA'] as const)(
      'recusa %s levantando proibição',
      async (papel) => {
        const { insumoId, biscoitoId } = await semearCatalogo();
        await prisma.restricaoDeForma.create({
          data: { insumoId, formaId: biscoitoId, motivo: 'Não faz.' },
        });
        const sessao = autenticado(await entrarComo(papel));

        await sessao.delete(`/api/v1/catalogo/restricoes/${insumoId}/${biscoitoId}`).expect(403);

        expect(await prisma.restricaoDeForma.count()).toBe(1);
      },
    );
  });
});
