import type { INestApplication } from '@nestjs/common';
import { IdentidadeService } from '../identidade/identidade.service';
import { COOKIE_SESSAO } from '../identidade/requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';

/**
 * Id malformado na URL.
 *
 * Antes do filtro, qualquer `:id` que não fosse UUID dava **500**: o erro de
 * conversão do Prisma subia como falha interna. Dizia "nós quebramos" sobre um
 * id que não é id, e enchia o log de erro interno — que é justamente o sinal
 * que alguém monitora.
 *
 * O par que importa está em cada teste: **malformado dá 400, e UUID válido
 * que não existe continua dando 404**. Se o filtro passasse a engolir demais,
 * é o 404 que viraria 400 e o segundo `expect` cairia.
 */
describe('id malformado (contra Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof cliente>;
  let sessao: string;

  const UUID_QUE_NAO_EXISTE = '00000000-0000-4000-8000-000000000000';

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
        '"tutor", "clinica_usuario", "clinica" CASCADE',
    );
    http = cliente(app);

    await app
      .get(IdentidadeService)
      .criarUsuario(
        { email: 'vet@clinica.test', nome: 'Renata', papel: 'VETERINARIO', senha: SENHA },
        { id: null },
      );

    const resposta = await http
      .post('/api/v1/auth/entrar')
      .send({ email: 'vet@clinica.test', senha: SENHA })
      .expect(204);

    sessao = cookieDa(resposta, COOKIE_SESSAO);
  });

  function comSessao(caminho: string) {
    return http.get(caminho).set('Cookie', `${COOKIE_SESSAO}=${sessao}`);
  }

  describe.each([
    ['receita', '/api/v1/receituario/receitas'],
    ['tutor', '/api/v1/receituario/tutores'],
    ['paciente', '/api/v1/receituario/pacientes'],
  ])('%s', (_nome, base) => {
    it.each(['naoeuuid', 'undefined', 'null', '123', '00000000-0000-4000-8000-00000000000'])(
      'responde 400 para o id %p',
      async (id) => {
        await comSessao(`${base}/${id}`).expect(400);
      },
    );

    it('e continua respondendo 404 para UUID válido que não existe', async () => {
      await comSessao(`${base}/${UUID_QUE_NAO_EXISTE}`).expect(404);
    });
  });

  it('a mensagem não descreve o schema', async () => {
    const resposta = await comSessao('/api/v1/receituario/receitas/naoeuuid').expect(400);

    // O texto do Prisma cita tabela e coluna. Não ajuda quem chamou, e
    // desenha o banco para quem estiver sondando.
    expect(resposta.body.message).toBe('Identificador inválido.');
    expect(JSON.stringify(resposta.body)).not.toMatch(/receita|column|coluna|uuid/i);
  });

  it('vale também para a sessão ausente, que é recusada antes do id', async () => {
    // 401 vem antes de qualquer coisa: o guard não chega a tocar no id, e o
    // filtro não deve mudar isso.
    await http.get('/api/v1/receituario/receitas/naoeuuid').expect(401);
  });
});
