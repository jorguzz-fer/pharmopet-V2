import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EmailService, type Mensagem } from './email.service';
import { IdentidadeService } from './identidade.service';
import { COOKIE_SESSAO } from './requisicao';
import { PrismaService } from '../prisma/prisma.service';
import { cliente, cookieDa, limparBanco, subirAplicacao } from '../teste/ambiente';

const SENHA = 'uma senha bem longa';
const SENHA_NOVA = 'outra senha igualmente longa';

/**
 * Recuperação de senha.
 *
 * O que estes testes guardam, em ordem de gravidade: que a resposta **não
 * distingue** conta que existe de conta que não existe — aqui o e-mail do
 * veterinário é o identificador, e distinguir entregaria a carteira de
 * clientes da farmácia a quem tiver uma lista de endereços; que o token serve
 * uma vez só e vence; e que trocar a senha **derruba as sessões abertas**, que
 * é o motivo de alguém redefinir com pressa.
 *
 * O token nunca é lido do banco: sai do HTML do e-mail, como sairia da caixa
 * de entrada de quem pediu. É o caminho inteiro, e não o pedaço conveniente.
 */
describe('redefinição de senha (contra Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof cliente>;

  /** As mensagens que teriam saído. O envio de verdade nunca é chamado. */
  let enviadas: Mensagem[];
  let enviar: jest.SpyInstance;
  let configurado: jest.SpyInstance;

  beforeAll(async () => {
    ({ app, prisma } = await subirAplicacao());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await limparBanco(prisma);
    http = cliente(app);

    const email = app.get(EmailService);
    enviadas = [];
    enviar = jest.spyOn(email, 'enviar').mockImplementation(async (mensagem) => {
      enviadas.push(mensagem);
    });
    // A instalação de teste não tem chave de e-mail; sem isto toda rota
    // responderia 503 e os testes provariam só que a chave falta.
    configurado = jest.spyOn(email, 'configurado', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    enviar.mockRestore();
    configurado.mockRestore();
  });

  async function criar(email: string): Promise<{ id: string }> {
    const identidade = app.get(IdentidadeService);
    const usuario = await identidade.criarUsuario(
      { email, nome: 'Fulana', papel: 'VETERINARIO', senha: SENHA, crmv: 'SP-1234' },
      { id: null },
    );
    return { id: usuario.id };
  }

  /** Pede o link e devolve o token que foi parar no e-mail. */
  async function pedirToken(email: string): Promise<string> {
    const antes = enviadas.length;
    await http.post('/api/v1/auth/senha/esqueci').send({ email }).expect(204);

    expect(enviadas).toHaveLength(antes + 1);
    return tokenDoEmail(enviadas[enviadas.length - 1]!);
  }

  async function entrar(email: string, senha = SENHA): Promise<string> {
    const resposta = await http.post('/api/v1/auth/entrar').send({ email, senha }).expect(204);
    return cookieDa(resposta, COOKIE_SESSAO);
  }

  describe('o pedido não diz nada sobre a conta', () => {
    it('responde igual para e-mail que não existe, e não manda nada', async () => {
      await http
        .post('/api/v1/auth/senha/esqueci')
        .send({ email: 'ninguem@lugar.test' })
        .expect(204);

      expect(enviadas).toEqual([]);
    });

    it('responde igual para conta desativada, e não manda nada', async () => {
      const { id } = await criar('desligada@clinica.test');
      await prisma.usuario.update({ where: { id }, data: { desativadoEm: new Date() } });

      await http
        .post('/api/v1/auth/senha/esqueci')
        .send({ email: 'desligada@clinica.test' })
        .expect(204);

      expect(enviadas).toEqual([]);
    });

    it('aceita o e-mail com outra caixa e espaços em volta', async () => {
      await criar('renata@clinica.test');

      await http
        .post('/api/v1/auth/senha/esqueci')
        .send({ email: '  Renata@Clinica.TEST  ' })
        .expect(204);

      expect(enviadas).toHaveLength(1);
      expect(enviadas[0]!.para).toBe('renata@clinica.test');
    });

    it('recusa o que não é e-mail', async () => {
      await http.post('/api/v1/auth/senha/esqueci').send({ email: 'nao-e-email' }).expect(400);

      expect(enviadas).toEqual([]);
    });
  });

  describe('o link', () => {
    it('chega no e-mail e abre a tela', async () => {
      await criar('renata@clinica.test');
      const token = await pedirToken('renata@clinica.test');

      await http.get(`/api/v1/auth/senha/redefinir/${token}`).expect(204);
    });

    it('não existe no banco em texto claro', async () => {
      await criar('renata@clinica.test');
      const token = await pedirToken('renata@clinica.test');

      const guardados = await prisma.tokenDeRedefinicao.findMany({ select: { tokenHash: true } });

      expect(guardados).toHaveLength(1);
      expect(guardados[0]!.tokenHash).not.toContain(token);
      expect(guardados[0]!.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    });

    it('troca a senha: a nova entra e a antiga não', async () => {
      await criar('renata@clinica.test');
      const token = await pedirToken('renata@clinica.test');

      await http
        .post('/api/v1/auth/senha/redefinir')
        .send({ token, senhaNova: SENHA_NOVA })
        .expect(204);

      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'renata@clinica.test', senha: SENHA })
        .expect(401);

      await entrar('renata@clinica.test', SENHA_NOVA);
    });

    it('serve uma vez só', async () => {
      await criar('renata@clinica.test');
      const token = await pedirToken('renata@clinica.test');

      await http
        .post('/api/v1/auth/senha/redefinir')
        .send({ token, senhaNova: SENHA_NOVA })
        .expect(204);

      await http
        .post('/api/v1/auth/senha/redefinir')
        .send({ token, senhaNova: 'uma terceira senha bem longa' })
        .expect(404);

      // E a segunda senha não entrou pela porta dos fundos.
      await entrar('renata@clinica.test', SENHA_NOVA);
    });

    it('morre quando um pedido novo é feito', async () => {
      await criar('renata@clinica.test');
      const antigo = await pedirToken('renata@clinica.test');
      const novo = await pedirToken('renata@clinica.test');

      expect(novo).not.toBe(antigo);
      await http.get(`/api/v1/auth/senha/redefinir/${antigo}`).expect(404);
      await http.get(`/api/v1/auth/senha/redefinir/${novo}`).expect(204);
    });

    it('vence', async () => {
      await criar('renata@clinica.test');
      const token = await pedirToken('renata@clinica.test');

      await prisma.tokenDeRedefinicao.updateMany({
        data: { expiraEm: new Date(Date.now() - 1_000) },
      });

      await http.get(`/api/v1/auth/senha/redefinir/${token}`).expect(404);
      await http
        .post('/api/v1/auth/senha/redefinir')
        .send({ token, senhaNova: SENHA_NOVA })
        .expect(404);
    });

    it('não vale inventado', async () => {
      await http.get('/api/v1/auth/senha/redefinir/naoexisto').expect(404);
      await http
        .post('/api/v1/auth/senha/redefinir')
        .send({ token: 'naoexisto', senhaNova: SENHA_NOVA })
        .expect(404);
    });

    it('recusa senha nova curta demais, e não gasta o token', async () => {
      await criar('renata@clinica.test');
      const token = await pedirToken('renata@clinica.test');

      await http
        .post('/api/v1/auth/senha/redefinir')
        .send({ token, senhaNova: 'curta' })
        .expect(400);

      await http.get(`/api/v1/auth/senha/redefinir/${token}`).expect(204);
    });
  });

  describe('o que a redefinição faz com o resto', () => {
    it('derruba as sessões que estavam abertas', async () => {
      await criar('renata@clinica.test');
      const sessao = await entrar('renata@clinica.test');
      await http.get('/api/v1/auth/eu').set('Cookie', `${COOKIE_SESSAO}=${sessao}`).expect(200);

      const token = await pedirToken('renata@clinica.test');
      await http
        .post('/api/v1/auth/senha/redefinir')
        .send({ token, senhaNova: SENHA_NOVA })
        .expect(204);

      // Quem redefine costuma estar redefinindo porque desconfia que alguém
      // mais entrou. A sessão do outro não pode continuar de pé.
      await http.get('/api/v1/auth/eu').set('Cookie', `${COOKIE_SESSAO}=${sessao}`).expect(401);
    });

    it('limpa o bloqueio por tentativas', async () => {
      const { id } = await criar('renata@clinica.test');
      await prisma.usuario.update({
        where: { id },
        data: { tentativasFalhas: 9, bloqueadoAte: new Date(Date.now() + 3_600_000) },
      });

      const token = await pedirToken('renata@clinica.test');
      await http
        .post('/api/v1/auth/senha/redefinir')
        .send({ token, senhaNova: SENHA_NOVA })
        .expect(204);

      // Foi o bloqueio que mandou a pessoa pedir o link; deixá-lo de pé faria
      // a redefinição não resolver nada.
      await entrar('renata@clinica.test', SENHA_NOVA);
    });
  });

  describe('trilha de auditoria', () => {
    it('registra o pedido atendido com o dono, e o não atendido sem ele', async () => {
      const { id } = await criar('renata@clinica.test');
      await pedirToken('renata@clinica.test');
      await http
        .post('/api/v1/auth/senha/esqueci')
        .send({ email: 'ninguem@lugar.test' })
        .expect(204);

      const eventos = await prisma.eventoDeAuditoria.findMany({
        where: { acao: 'REDEFINICAO_PEDIDA' },
        orderBy: { ocorridoEm: 'asc' },
      });

      expect(eventos).toHaveLength(2);
      expect(eventos[0]).toMatchObject({ usuarioId: id, detalhe: { enviado: true } });
      expect(eventos[1]).toMatchObject({ usuarioId: null, detalhe: { enviado: false } });
      // O alvo do pedido sem dono guarda o endereço digitado: é o que permite
      // ver alguém varrendo uma lista de e-mails.
      expect(eventos[1]!.alvo).toBe('email:ninguem@lugar.test');
    });

    it('registra a troca dizendo que veio por redefinição', async () => {
      const { id } = await criar('renata@clinica.test');
      const token = await pedirToken('renata@clinica.test');
      await http
        .post('/api/v1/auth/senha/redefinir')
        .send({ token, senhaNova: SENHA_NOVA })
        .expect(204);

      const evento = await prisma.eventoDeAuditoria.findFirst({
        where: { acao: 'SENHA_ALTERADA' },
      });

      expect(evento).toMatchObject({ usuarioId: id, detalhe: { via: 'redefinicao' } });
    });
  });

  describe('instalação sem e-mail configurado', () => {
    it('diz que não dá, em vez de aceitar e nunca mandar', async () => {
      configurado.mockReturnValue(false);
      await criar('renata@clinica.test');

      const resposta = await http
        .post('/api/v1/auth/senha/esqueci')
        .send({ email: 'renata@clinica.test' })
        .expect(503);

      expect(resposta.body.message).toMatch(/não está configurada/i);
      expect(enviadas).toEqual([]);
      // E nada ficou pendurado no banco esperando um e-mail que não sai.
      expect(await prisma.tokenDeRedefinicao.count()).toBe(0);
    });
  });

  describe('o e-mail', () => {
    it('trata o nome como texto de cadastro, não como HTML', async () => {
      const identidade = app.get(IdentidadeService);
      await identidade.criarUsuario(
        {
          email: 'esperta@clinica.test',
          nome: '<img src=x onerror=alert(1)>',
          papel: 'CLINICA',
          senha: SENHA,
        },
        { id: null },
      );

      await pedirToken('esperta@clinica.test');

      expect(enviadas[0]!.html).not.toContain('<img');
      expect(enviadas[0]!.html).toContain('&lt;img');
    });

    it('diz o que fazer quando não foi a pessoa que pediu', async () => {
      await criar('renata@clinica.test');
      await pedirToken('renata@clinica.test');

      expect(enviadas[0]!.html).toMatch(/se não foi você/i);
    });
  });
});

/** O token como quem recebeu o e-mail o extrairia: do link, e de mais nada. */
function tokenDoEmail(mensagem: Mensagem): string {
  const achado = /\/redefinir-senha\?token=([^"&]+)/.exec(mensagem.html);
  if (!achado) throw new Error(`O e-mail não trouxe um link de redefinição: ${mensagem.html}`);

  return decodeURIComponent(achado[1]!);
}
