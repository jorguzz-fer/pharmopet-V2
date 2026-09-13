import type { INestApplication } from '@nestjs/common';
import type { Papel } from '@prisma/client';
import { IdentidadeService } from './identidade.service';
import { CABECALHO_CSRF, COOKIE_CSRF, COOKIE_SESSAO } from './requisicao';
import { PrismaService } from '../prisma/prisma.service';
import {
  cliente,
  cookieDa,
  diretivasDoCookie,
  limparBanco,
  subirAplicacao,
} from '../teste/ambiente';

const SENHA = 'uma senha bem longa';

describe('identidade (contra Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await subirAplicacao());
  });

  afterAll(async () => {
    await app.close();
  });

  let http: ReturnType<typeof cliente>;

  beforeEach(async () => {
    await limparBanco(prisma);
    // Cada teste fala de um IP próprio: o limitador continua ligado, e a suíte
    // não soma tudo num balde só.
    http = cliente(app);
  });

  async function criar(
    email: string,
    papel: Papel = 'ADMIN',
  ): Promise<{ id: string; email: string }> {
    const identidade = app.get(IdentidadeService);
    const usuario = await identidade.criarUsuario(
      { email, nome: 'Fulano', papel, senha: SENHA },
      { id: null },
    );
    return { id: usuario.id, email: usuario.email };
  }

  async function entrar(email: string): Promise<{ sessao: string; csrf: string }> {
    const resposta = await http
      .post('/api/v1/auth/entrar')
      .send({ email, senha: SENHA })
      .expect(204);

    return {
      sessao: cookieDa(resposta, COOKIE_SESSAO),
      csrf: cookieDa(resposta, COOKIE_CSRF),
    };
  }

  describe('negação por padrão', () => {
    it('recusa quem não entrou', async () => {
      await http.get('/api/v1/auth/eu').expect(401);
    });

    it('deixa passar o que foi marcado como público', async () => {
      await http.get('/api/v1/health').expect(200);
    });

    it('recusa um token de sessão inventado', async () => {
      await http.get('/api/v1/auth/eu').set('Cookie', `${COOKIE_SESSAO}=naoexisto`).expect(401);
    });
  });

  describe('entrada', () => {
    it('abre sessão e identifica quem entrou', async () => {
      await criar('admin@clinica.test');
      const { sessao } = await entrar('admin@clinica.test');

      const resposta = await http
        .get('/api/v1/auth/eu')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .expect(200);

      expect(resposta.body).toMatchObject({ email: 'admin@clinica.test', papel: 'ADMIN' });
    });

    /**
     * Se o cookie de sessão fosse legível pelo JavaScript, qualquer XSS — num
     * nome de paciente, num campo de observação — viraria roubo de sessão.
     */
    it('entrega o cookie de sessão como HttpOnly, e o anti-CSRF não', async () => {
      await criar('admin@clinica.test');
      const resposta = await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'admin@clinica.test', senha: SENHA })
        .expect(204);

      expect(diretivasDoCookie(resposta, COOKIE_SESSAO)).toContain('HttpOnly');
      expect(diretivasDoCookie(resposta, COOKIE_SESSAO)).toContain('SameSite=Lax');
      expect(diretivasDoCookie(resposta, COOKIE_CSRF)).not.toContain('HttpOnly');
    });

    /**
     * Recusa que distingue "não existe" de "senha errada" entrega a lista de
     * quem tem conta. Aqui o e-mail do veterinário é o identificador, então
     * isso vazaria a carteira de clientes da farmácia.
     */
    it('recusa e-mail inexistente e senha errada exatamente igual', async () => {
      await criar('admin@clinica.test');

      const inexistente = await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'ninguem@clinica.test', senha: SENHA })
        .expect(401);

      const senhaErrada = await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'admin@clinica.test', senha: 'outra coisa qualquer' })
        .expect(401);

      expect(inexistente.body).toEqual(senhaErrada.body);
    });

    it('recusa quem foi desativado, ainda que a senha esteja certa', async () => {
      const usuario = await criar('demitido@clinica.test');
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { desativadoEm: new Date() },
      });

      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'demitido@clinica.test', senha: SENHA })
        .expect(401);
    });

    it('trata o e-mail sem distinguir maiúsculas', async () => {
      await criar('admin@clinica.test');

      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'Admin@Clinica.TEST', senha: SENHA })
        .expect(204);
    });
  });

  describe('bloqueio progressivo', () => {
    it('bloqueia a conta depois de cinco senhas erradas, mesmo com a certa em seguida', async () => {
      await criar('alvo@clinica.test');

      for (let i = 0; i < 5; i++) {
        await http
          .post('/api/v1/auth/entrar')
          .send({ email: 'alvo@clinica.test', senha: 'errada' })
          .expect(401);
      }

      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'alvo@clinica.test', senha: SENHA })
        .expect(401);

      const registro = await prisma.usuario.findUniqueOrThrow({
        where: { email: 'alvo@clinica.test' },
      });
      expect(registro.tentativasFalhas).toBe(5);
      expect(registro.bloqueadoAte).not.toBeNull();
    });

    it('libera assim que o bloqueio vence', async () => {
      const usuario = await criar('alvo@clinica.test');

      for (let i = 0; i < 5; i++) {
        await http
          .post('/api/v1/auth/entrar')
          .send({ email: 'alvo@clinica.test', senha: 'errada' });
      }

      // Empurra o fim do bloqueio para o passado, em vez de esperar trinta
      // segundos: o que se quer provar é que a data é consultada, não o relógio.
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { bloqueadoAte: new Date(Date.now() - 1000) },
      });

      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'alvo@clinica.test', senha: SENHA })
        .expect(204);
    });

    it('zera a escada quando a pessoa acerta a senha', async () => {
      await criar('atrapalhado@clinica.test');

      for (let i = 0; i < 3; i++) {
        await http
          .post('/api/v1/auth/entrar')
          .send({ email: 'atrapalhado@clinica.test', senha: 'errada' });
      }
      await entrar('atrapalhado@clinica.test');

      const registro = await prisma.usuario.findUniqueOrThrow({
        where: { email: 'atrapalhado@clinica.test' },
      });
      expect(registro.tentativasFalhas).toBe(0);
      expect(registro.bloqueadoAte).toBeNull();
    });
  });

  describe('anti-CSRF', () => {
    it('recusa mutação sem o cabeçalho', async () => {
      await criar('admin@clinica.test');
      const { sessao } = await entrar('admin@clinica.test');

      await http.post('/api/v1/auth/sair').set('Cookie', `${COOKIE_SESSAO}=${sessao}`).expect(403);
    });

    it('recusa mutação com o cabeçalho de outra sessão', async () => {
      await criar('admin@clinica.test');
      await criar('outro@clinica.test', 'FARMACIA');

      const alvo = await entrar('admin@clinica.test');
      const atacante = await entrar('outro@clinica.test');

      await http
        .post('/api/v1/auth/sair')
        .set('Cookie', `${COOKIE_SESSAO}=${alvo.sessao}`)
        .set(CABECALHO_CSRF, atacante.csrf)
        .expect(403);
    });

    it('deixa a leitura passar sem cabeçalho — GET não muda nada', async () => {
      await criar('admin@clinica.test');
      const { sessao } = await entrar('admin@clinica.test');

      await http.get('/api/v1/auth/eu').set('Cookie', `${COOKIE_SESSAO}=${sessao}`).expect(200);
    });

    /**
     * A frase é contrato com a tela: é a única coisa que distingue este 403 —
     * que recarregar resolve — do 403 de papel, que não resolve. Enquanto as
     * duas eram indistinguíveis, um ADMIN com permissão de sobra foi
     * investigar permissão por causa de um cookie que não chegou.
     */
    it('diz que a falha é da sessão, e diz o que fazer', async () => {
      await criar('admin@clinica.test');
      const { sessao } = await entrar('admin@clinica.test');

      const resposta = await http
        .post('/api/v1/auth/sair')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .expect(403);

      const mensagem = (resposta.body as { message: string }).message;
      expect(mensagem).toContain('sessão');
      expect(mensagem).toContain('Recarregue');
      expect(mensagem).not.toContain('papel');
    });
  });

  describe('autorização por papel', () => {
    it('deixa o administrador criar usuário', async () => {
      await criar('admin@clinica.test');
      const { sessao, csrf } = await entrar('admin@clinica.test');

      await http
        .post('/api/v1/auth/usuarios')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .set(CABECALHO_CSRF, csrf)
        .send({
          email: 'nova@clinica.test',
          nome: 'Nova Pessoa',
          papel: 'VETERINARIO',
          senha: SENHA,
        })
        .expect(201);
    });

    it.each(['VETERINARIO', 'FARMACIA'] as const)('recusa %s criando usuário', async (papel) => {
      await criar('pessoa@clinica.test', papel);
      const { sessao, csrf } = await entrar('pessoa@clinica.test');

      await http
        .post('/api/v1/auth/usuarios')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .set(CABECALHO_CSRF, csrf)
        .send({
          email: 'intruso@clinica.test',
          nome: 'Intruso',
          papel: 'ADMIN',
          senha: SENHA,
        })
        .expect(403);

      expect(await prisma.usuario.count({ where: { email: 'intruso@clinica.test' } })).toBe(0);
    });
  });

  describe('lista de usuários', () => {
    it('devolve a equipe, filtrada por papel e por busca', async () => {
      await criar('admin@clinica.test');
      await criar('ana@clinica.test', 'VETERINARIO');
      await criar('bruno@clinica.test', 'FARMACIA');
      const { sessao } = await entrar('admin@clinica.test');
      const comSessao = `${COOKIE_SESSAO}=${sessao}`;

      const todos = await http.get('/api/v1/auth/usuarios').set('Cookie', comSessao).expect(200);
      expect(todos.body.usuarios).toHaveLength(3);

      const vets = await http
        .get('/api/v1/auth/usuarios?papel=VETERINARIO')
        .set('Cookie', comSessao)
        .expect(200);
      expect(vets.body.usuarios).toHaveLength(1);
      expect(vets.body.usuarios[0].email).toBe('ana@clinica.test');

      const porTexto = await http
        .get('/api/v1/auth/usuarios?busca=bruno')
        .set('Cookie', comSessao)
        .expect(200);
      expect(porTexto.body.usuarios).toHaveLength(1);
      expect(porTexto.body.usuarios[0].email).toBe('bruno@clinica.test');
    });

    it('não devolve hash de senha nem contagem de tentativas', async () => {
      await criar('admin@clinica.test');
      const { sessao } = await entrar('admin@clinica.test');

      const resposta = await http
        .get('/api/v1/auth/usuarios')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .expect(200);

      // O corpo inteiro, e não campo a campo: um dia alguém devolve a entidade
      // do Prisma direto, e uma checagem por nome de campo não perceberia.
      const cru = JSON.stringify(resposta.body);
      expect(cru).not.toContain('senhaHash');
      expect(cru).not.toContain('$argon2');
      expect(cru).not.toContain('tentativasFalhas');
    });

    it.each(['VETERINARIO', 'FARMACIA', 'CLINICA'] as const)(
      'recusa %s listando usuários',
      async (papel) => {
        await criar('pessoa@clinica.test', papel);
        const { sessao } = await entrar('pessoa@clinica.test');

        await http
          .get('/api/v1/auth/usuarios')
          .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
          .expect(403);
      },
    );
  });

  describe('revogação', () => {
    it('derruba a sessão ao sair', async () => {
      await criar('admin@clinica.test');
      const { sessao, csrf } = await entrar('admin@clinica.test');

      await http
        .post('/api/v1/auth/sair')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .set(CABECALHO_CSRF, csrf)
        .expect(204);

      await http.get('/api/v1/auth/eu').set('Cookie', `${COOKIE_SESSAO}=${sessao}`).expect(401);
    });

    /**
     * O motivo de trocar a senha costuma ser suspeitar que alguém mais está
     * dentro da conta. Se as outras sessões sobrevivessem, a troca não
     * resolveria nada — é o "revogação imediata" que um JWT não entrega.
     */
    it('derruba TODAS as sessões ao trocar a senha, não só a que trocou', async () => {
      await criar('admin@clinica.test');
      const primeira = await entrar('admin@clinica.test');
      const segunda = await entrar('admin@clinica.test');

      await http
        .post('/api/v1/auth/senha')
        .set('Cookie', `${COOKIE_SESSAO}=${primeira.sessao}`)
        .set(CABECALHO_CSRF, primeira.csrf)
        .send({ senhaAtual: SENHA, senhaNova: 'outra senha bem longa' })
        .expect(204);

      for (const s of [primeira.sessao, segunda.sessao]) {
        await http.get('/api/v1/auth/eu').set('Cookie', `${COOKIE_SESSAO}=${s}`).expect(401);
      }
    });

    it('exige a senha atual para trocar, mesmo com sessão válida', async () => {
      await criar('admin@clinica.test');
      const { sessao, csrf } = await entrar('admin@clinica.test');

      await http
        .post('/api/v1/auth/senha')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .set(CABECALHO_CSRF, csrf)
        .send({ senhaAtual: 'chute', senhaNova: 'outra senha bem longa' })
        .expect(401);

      await http.get('/api/v1/auth/eu').set('Cookie', `${COOKIE_SESSAO}=${sessao}`).expect(200);
    });

    it('passa a valer a senha nova', async () => {
      await criar('admin@clinica.test');
      const { sessao, csrf } = await entrar('admin@clinica.test');

      await http
        .post('/api/v1/auth/senha')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .set(CABECALHO_CSRF, csrf)
        .send({ senhaAtual: SENHA, senhaNova: 'outra senha bem longa' })
        .expect(204);

      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'admin@clinica.test', senha: SENHA })
        .expect(401);

      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'admin@clinica.test', senha: 'outra senha bem longa' })
        .expect(204);
    });
  });

  describe('trilha de auditoria', () => {
    it('registra a entrada aceita com o autor', async () => {
      const usuario = await criar('admin@clinica.test');
      await entrar('admin@clinica.test');

      const eventos = await prisma.eventoDeAuditoria.findMany({
        where: { acao: 'ENTRADA_ACEITA' },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.usuarioId).toBe(usuario.id);
    });

    it('registra a tentativa num e-mail que não existe, sem autor', async () => {
      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'ninguem@clinica.test', senha: SENHA })
        .expect(401);

      const evento = await prisma.eventoDeAuditoria.findFirstOrThrow({
        where: { acao: 'ENTRADA_RECUSADA' },
      });
      expect(evento.usuarioId).toBeNull();
      expect(evento.alvo).toBe('email:ninguem@clinica.test');
    });

    it('registra o bloqueio da conta', async () => {
      await criar('alvo@clinica.test');

      for (let i = 0; i < 5; i++) {
        await http
          .post('/api/v1/auth/entrar')
          .send({ email: 'alvo@clinica.test', senha: 'errada' });
      }

      expect(await prisma.eventoDeAuditoria.count({ where: { acao: 'CONTA_BLOQUEADA' } })).toBe(1);
    });

    /** Auditoria com senha dentro é um vazamento com carimbo de data e hora. */
    it('nunca guarda a senha tentada', async () => {
      await criar('admin@clinica.test');
      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'admin@clinica.test', senha: 'senha-secreta-que-nao-pode-vazar' });

      const eventos = await prisma.eventoDeAuditoria.findMany();
      const tudo = JSON.stringify(eventos);

      expect(tudo).not.toContain('senha-secreta-que-nao-pode-vazar');
      expect(tudo).not.toContain(SENHA);
    });
  });

  /**
   * Desativar já valia desde a fase 2: o login recusa e a sessão aberta para de
   * resolver. O que não existia era o caminho para acionar — `USUARIO_DESATIVADO`
   * estava no enum de auditoria e nunca era emitido, porque só o acesso direto
   * ao banco desligava alguém.
   */
  describe('alterar uma conta da equipe', () => {
    async function comoAdmin(): Promise<{
      id: string;
      patch: (id: string) => ReturnType<typeof http.patch>;
    }> {
      const admin = await criar('admin@clinica.test');
      const { sessao, csrf } = await entrar('admin@clinica.test');

      return {
        id: admin.id,
        patch: (id: string) =>
          http
            .patch(`/api/v1/auth/usuarios/${id}`)
            .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
            .set(CABECALHO_CSRF, csrf),
      };
    }

    it.each(['VETERINARIO', 'FARMACIA', 'CLINICA'] as const)(
      'recusa %s alterando conta alheia',
      async (papel) => {
        const alvo = await criar('alvo@clinica.test', 'VETERINARIO');
        await criar('outro@clinica.test', papel);
        const { sessao, csrf } = await entrar('outro@clinica.test');

        await http
          .patch(`/api/v1/auth/usuarios/${alvo.id}`)
          .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
          .set(CABECALHO_CSRF, csrf)
          .send({ nome: 'Invadido' })
          .expect(403);
      },
    );

    it('corrige o nome sem mexer no resto', async () => {
      const alvo = await criar('vet@clinica.test', 'VETERINARIO');
      const { patch } = await comoAdmin();

      await patch(alvo.id).send({ nome: 'Renata Mattos' }).expect(200);

      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
      expect(depois.nome).toBe('Renata Mattos');
      expect(depois.papel).toBe('VETERINARIO');
      expect(depois.email).toBe('vet@clinica.test');
    });

    it('desativa, e a pessoa deixa de entrar mesmo com a senha certa', async () => {
      const alvo = await criar('demitido@clinica.test', 'FARMACIA');
      const { patch } = await comoAdmin();

      await patch(alvo.id).send({ desativado: true }).expect(200);

      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'demitido@clinica.test', senha: SENHA })
        .expect(401);
    });

    /** Sessão aberta não sobrevive ao desligamento: ela para de resolver. */
    it('derruba a sessão que a pessoa já tinha aberta', async () => {
      const alvo = await criar('demitido@clinica.test', 'FARMACIA');
      const dele = await entrar('demitido@clinica.test');
      const { patch } = await comoAdmin();

      await http
        .get('/api/v1/auth/eu')
        .set('Cookie', `${COOKIE_SESSAO}=${dele.sessao}`)
        .expect(200);

      await patch(alvo.id).send({ desativado: true }).expect(200);

      await http
        .get('/api/v1/auth/eu')
        .set('Cookie', `${COOKIE_SESSAO}=${dele.sessao}`)
        .expect(401);
    });

    it('religa quem tinha sido desativado', async () => {
      const alvo = await criar('voltou@clinica.test', 'FARMACIA');
      const { patch } = await comoAdmin();
      await patch(alvo.id).send({ desativado: true }).expect(200);

      await patch(alvo.id).send({ desativado: false }).expect(200);

      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'voltou@clinica.test', senha: SENHA })
        .expect(204);
    });

    it('registra o desligamento na auditoria', async () => {
      const alvo = await criar('demitido@clinica.test', 'FARMACIA');
      const { id: autorId, patch } = await comoAdmin();

      await patch(alvo.id).send({ desativado: true }).expect(200);

      const evento = await prisma.eventoDeAuditoria.findFirst({
        where: { acao: 'USUARIO_DESATIVADO' },
      });
      expect(evento).toMatchObject({ usuarioId: autorId, alvo: `usuario:${alvo.id}` });
    });

    /** Reenviar o mesmo corpo não pode apagar quando a pessoa saiu. */
    it('não move a data ao desativar duas vezes', async () => {
      const alvo = await criar('demitido@clinica.test', 'FARMACIA');
      const { patch } = await comoAdmin();

      await patch(alvo.id).send({ desativado: true }).expect(200);
      const primeira = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });

      await patch(alvo.id).send({ desativado: true }).expect(200);
      const segunda = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });

      expect(segunda.desativadoEm).toEqual(primeira.desativadoEm);
    });

    it('desativado continua na lista, em vez de sumir', async () => {
      const alvo = await criar('demitido@clinica.test', 'FARMACIA');
      const { patch } = await comoAdmin();
      await patch(alvo.id).send({ desativado: true }).expect(200);

      const { sessao } = await entrar('admin@clinica.test');
      const lista = await http
        .get('/api/v1/auth/usuarios')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .expect(200);

      const corpo = lista.body as { usuarios: { id: string; desativado: boolean }[] };
      expect(corpo.usuarios.find((u) => u.id === alvo.id)).toMatchObject({ desativado: true });
    });

    /**
     * Sair pela porta e jogar a chave dentro: a sessão cai no mesmo instante, e
     * o conserto passa a exigir o comando no servidor.
     */
    it('não deixa o administrador desativar a própria conta', async () => {
      const { id, patch } = await comoAdmin();

      await patch(id).send({ desativado: true }).expect(409);

      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id } });
      expect(depois.desativadoEm).toBeNull();
    });

    /** Sem administrador ativo, ninguém administra a instalação. */
    it('não deixa rebaixar o último administrador ativo', async () => {
      const outro = await criar('admin2@clinica.test');
      const { patch } = await comoAdmin();
      await patch(outro.id).send({ desativado: true }).expect(200);

      const sobrou = await prisma.usuario.findUniqueOrThrow({
        where: { email: 'admin@clinica.test' },
      });
      await patch(sobrou.id).send({ papel: 'FARMACIA' }).expect(409);

      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: sobrou.id } });
      expect(depois.papel).toBe('ADMIN');
    });

    it('deixa rebaixar um administrador quando há outro ativo', async () => {
      const outro = await criar('admin2@clinica.test');
      const { patch } = await comoAdmin();

      await patch(outro.id).send({ papel: 'FARMACIA' }).expect(200);

      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: outro.id } });
      expect(depois.papel).toBe('FARMACIA');
    });

    /**
     * CRMV é credencial de quem assina receita. Pendurado num papel que não
     * prescreve, reapareceria numa promoção futura como se ainda valesse.
     */
    it('limpa o CRMV quando a pessoa deixa de ser veterinária', async () => {
      const vet = await app.get(IdentidadeService).criarUsuario(
        {
          email: 'vet@clinica.test',
          nome: 'Renata',
          papel: 'VETERINARIO',
          senha: SENHA,
          crmv: 'SP 28.114',
        },
        { id: null },
      );
      const { patch } = await comoAdmin();

      await patch(vet.id).send({ papel: 'FARMACIA' }).expect(200);

      const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: vet.id } });
      expect(depois.crmv).toBeNull();
    });

    it('404 em conta que não existe, em vez de criar uma', async () => {
      const { patch } = await comoAdmin();

      await patch('3f2a1b4c-0000-4000-8000-000000000000').send({ nome: 'Ninguém' }).expect(404);
    });
  });

  describe('formato de entrada', () => {
    it('recusa e-mail malformado antes de tocar o banco', async () => {
      await http
        .post('/api/v1/auth/entrar')
        .send({ email: 'nao-e-email', senha: SENHA })
        .expect(400);
    });

    it('recusa senha nova curta demais', async () => {
      await criar('admin@clinica.test');
      const { sessao, csrf } = await entrar('admin@clinica.test');

      await http
        .post('/api/v1/auth/senha')
        .set('Cookie', `${COOKIE_SESSAO}=${sessao}`)
        .set(CABECALHO_CSRF, csrf)
        .send({ senhaAtual: SENHA, senhaNova: 'curta' })
        .expect(400);
    });
  });
});
