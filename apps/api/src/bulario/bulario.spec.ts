import type { INestApplication } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import { IdentidadeService } from '../identidade/identidade.service';
import { COOKIE_SESSAO } from '../identidade/requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';

/**
 * O bulário é referência de leitura (ADR 0015): sem preço, sem escopo por
 * clínica, sem nada que dependa de quem pergunta. O que estes testes guardam é
 * a busca — que é a razão de a tela existir — e o recorte da resposta.
 */
describe('bulário (contra Postgres)', () => {
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
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "formulacao_do_bulario" CASCADE');
    http = cliente(app);
    await semear();
  });

  async function semear(): Promise<void> {
    await prisma.formulacaoDoBulario.createMany({
      data: [
        {
          numero: '4.2',
          titulo: 'Solução Otológica de Cetoconazol',
          linhaTerapeutica: 'Otológica',
          formaFarmaceutica: 'Solução otológica',
          indicacao: 'Otite externa por Malassezia.',
          composicao: '• Cetoconazol 1%\n• Veículo otológico q.s.p. 30 mL',
          especies: ['CANINO'],
        },
        {
          numero: '12.3',
          titulo: 'Gel Transdérmico de Mirtazapina para Gatos',
          linhaTerapeutica: 'Transdérmica',
          formaFarmaceutica: 'Gel transdérmico',
          indicacao: 'Estimulante do apetite em gatos com anorexia.',
          composicao: '• Mirtazapina 7,5 mg/dose\n• Gel transdérmico q.s.p. 30 g',
          modoDeUsar: 'Aplicar com luvas no lóbulo da orelha.',
          especies: ['FELINO'],
        },
        {
          // Sem espécie: 164 das 315 são assim, porque valem para mais de uma.
          numero: '1.1',
          titulo: 'Petisco Mastigável de Cetirizina',
          linhaTerapeutica: 'Antialérgica Oral',
          indicacao: 'Antipruriginoso na dermatite atópica.',
          composicao: '• Cetirizina HCl 10 mg',
          especies: [],
        },
      ],
    });
  }

  async function entrarComo(papel: Papel): Promise<string> {
    const email = `${papel.toLowerCase()}@clinica.test`;
    await app
      .get(IdentidadeService)
      .criarUsuario({ email, nome: 'Fulano', papel, senha: SENHA }, { id: null });

    const resposta = await http
      .post('/api/v1/auth/entrar')
      .send({ email, senha: SENHA })
      .expect(204);

    return cookieDa(resposta, COOKIE_SESSAO);
  }

  function get(sessao: string, caminho: string) {
    return http.get(caminho).set('Cookie', `${COOKIE_SESSAO}=${sessao}`);
  }

  describe('acesso', () => {
    it('recusa quem não entrou', async () => {
      await http.get('/api/v1/bulario').expect(401);
    });

    /** Referência clínica: não há custo nem clientela aqui para esconder. */
    it.each(['ADMIN', 'VETERINARIO', 'FARMACIA', 'CLINICA'] as const)(
      'deixa %s consultar',
      async (papel) => {
        const sessao = await entrarComo(papel);

        const resposta = await get(sessao, '/api/v1/bulario').expect(200);

        expect(resposta.body.total).toBe(3);
      },
    );
  });

  describe('busca', () => {
    /**
     * As três perguntas que se faz a um bulário, e quem pergunta não sabe em
     * qual campo está a resposta.
     */
    it('acha pela doença, que está na indicação', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario?busca=otite').expect(200);

      expect(resposta.body.formulacoes).toHaveLength(1);
      expect(resposta.body.formulacoes[0].numero).toBe('4.2');
    });

    it('acha pelo ativo, que está na composição', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario?busca=mirtazapina').expect(200);

      expect(resposta.body.formulacoes[0].numero).toBe('12.3');
    });

    it('acha pelo nome, que está no título', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario?busca=petisco').expect(200);

      expect(resposta.body.formulacoes[0].numero).toBe('1.1');
    });

    it('não diferencia maiúsculas nem exige a palavra inteira', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario?busca=CETOCONAZ').expect(200);

      expect(resposta.body.formulacoes).toHaveLength(1);
    });

    it('filtra por linha terapêutica', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario?linhaTerapeutica=Otológica').expect(200);

      expect(resposta.body.total).toBe(1);
    });

    /**
     * Espécie vazia é "o guia não disse", e mais da metade do bulário é assim.
     * Filtrar por CANINO não pode esconder a formulação que serve a cão e a
     * gato sem declarar nenhum dos dois — seria esconder metade do material.
     */
    it('inclui quem não declarou espécie ao filtrar por uma', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario?especie=CANINO').expect(200);

      const numeros = (resposta.body.formulacoes as { numero: string }[]).map((f) => f.numero);
      expect(numeros).toEqual(expect.arrayContaining(['4.2', '1.1']));
      expect(numeros).not.toContain('12.3');
    });

    /**
     * Dois filtros com `OR` dentro: soltos no mesmo objeto, o segundo
     * sobrescreveria o primeiro e a busca passaria a ignorar a espécie.
     */
    it('combina espécie e busca, em vez de uma anular a outra', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario?especie=FELINO&busca=gel').expect(200);

      expect(resposta.body.total).toBe(1);
      expect(resposta.body.formulacoes[0].numero).toBe('12.3');
    });

    it('devolve lista vazia, e não erro, quando nada casa', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario?busca=zzzznaoexiste').expect(200);

      expect(resposta.body).toMatchObject({ formulacoes: [], total: 0 });
    });
  });

  describe('o que cada resposta carrega', () => {
    /**
     * A lista não traz os blocos longos: 315 composições na mesma resposta
     * seriam quase um megabyte para mostrar títulos.
     */
    it('a lista não manda composição nem modo de usar', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario').expect(200);

      const primeira = resposta.body.formulacoes[0] as Record<string, unknown>;
      expect(primeira).not.toHaveProperty('composicao');
      expect(primeira).not.toHaveProperty('modoDeUsar');
      expect(primeira).toHaveProperty('titulo');
    });

    it('a formulação aberta traz o guia inteiro', async () => {
      const sessao = await entrarComo('VETERINARIO');
      const lista = await get(sessao, '/api/v1/bulario?busca=mirtazapina').expect(200);
      const id = (lista.body.formulacoes[0] as { id: string }).id;

      const resposta = await get(sessao, `/api/v1/bulario/${id}`).expect(200);

      expect(resposta.body).toMatchObject({
        numero: '12.3',
        composicao: expect.stringContaining('Mirtazapina'),
        modoDeUsar: expect.stringContaining('luvas'),
      });
    });

    it('404 em formulação que não existe', async () => {
      const sessao = await entrarComo('VETERINARIO');

      await get(sessao, '/api/v1/bulario/3f2a1b4c-0000-4000-8000-000000000000').expect(404);
    });

    /**
     * "linhas" tem de ser rota antes de ":id", senão vira um identificador
     * malformado e responde 404 no lugar da lista.
     */
    it('lista as linhas terapêuticas com a contagem de cada uma', async () => {
      const sessao = await entrarComo('VETERINARIO');

      const resposta = await get(sessao, '/api/v1/bulario/linhas').expect(200);

      expect(resposta.body.linhas).toEqual(
        expect.arrayContaining([{ nome: 'Otológica', quantidade: 1 }]),
      );
    });
  });
});
