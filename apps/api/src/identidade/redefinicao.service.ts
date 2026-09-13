import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';
import { AuditoriaService } from './auditoria.service';
import { EmailService } from './email.service';
import { SenhaService } from './senha.service';
import type { Origem } from './identidade.service';

/**
 * Quanto tempo o link vale.
 *
 * Uma hora, como na v1. É a janela em que a pessoa vai da caixa de entrada até
 * a tela; mais do que isso só aumenta o tempo em que um e-mail encaminhado por
 * engano ainda abre a conta.
 */
const VALIDADE_EM_MINUTOS = 60;

/**
 * Redefinição de senha por e-mail.
 *
 * O desenho é o da v1, que já estava aprovado: token aleatório, validade curta,
 * tokens anteriores invalidados, e **a mesma resposta exista ou não a conta**.
 * Essa última é a que mais importa aqui: uma resposta que distingue entrega a
 * lista de quem tem cadastro, e neste sistema o e-mail do veterinário é o
 * identificador — seria vazar a carteira de clientes da farmácia.
 */
@Injectable()
export class RedefinicaoService {
  private readonly logger = new Logger(RedefinicaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly auditoria: AuditoriaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Pede o link.
   *
   * Não devolve nada e não distingue nada: e-mail inexistente, conta
   * desativada e envio bem-sucedido saem iguais para quem chamou.
   *
   * A exceção é a instalação sem e-mail configurado, e ela é deliberada: não é
   * informação sobre nenhuma conta, e aceitar em silêncio deixaria a pessoa
   * esperando para sempre um link que ninguém vai mandar.
   */
  async pedir(email: string, origem: Origem): Promise<void> {
    if (!this.email.configurado) {
      throw new ServiceUnavailableException(
        'A recuperação de senha não está configurada nesta instalação. Fale com a administração.',
      );
    }

    const normalizado = email.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { email: normalizado } });

    // Conta que não existe ou que foi desligada: nada acontece, e quem pediu
    // recebe exatamente a mesma resposta de quem vai receber o link.
    if (!usuario || usuario.desativadoEm !== null) {
      await this.auditoria.registrar({
        acao: 'REDEFINICAO_PEDIDA',
        alvo: `email:${normalizado}`,
        detalhe: { enviado: false },
        ip: origem.ip,
        agenteDeUsuario: origem.agenteDeUsuario,
      });
      return;
    }

    // Um pedido novo derruba os anteriores: dois links vivos na mesma caixa de
    // entrada dobram a janela de quem conseguir ler o e-mail antigo.
    await this.prisma.tokenDeRedefinicao.updateMany({
      where: { usuarioId: usuario.id, usadoEm: null },
      data: { usadoEm: new Date() },
    });

    const token = randomBytes(32).toString('base64url');
    await this.prisma.tokenDeRedefinicao.create({
      data: {
        usuarioId: usuario.id,
        tokenHash: hashDo(token),
        expiraEm: new Date(Date.now() + VALIDADE_EM_MINUTOS * 60_000),
      },
    });

    await this.email.enviar({
      para: usuario.email,
      assunto: 'Redefinir sua senha da PharmoPet',
      html: corpoDoEmail(usuario.nome, this.linkDe(token)),
    });

    await this.auditoria.registrar({
      acao: 'REDEFINICAO_PEDIDA',
      usuarioId: usuario.id,
      detalhe: { enviado: true },
      ip: origem.ip,
      agenteDeUsuario: origem.agenteDeUsuario,
    });
  }

  /** Se o link ainda abre a tela. Não diz de quem é. */
  async vale(token: string): Promise<boolean> {
    return (await this.achar(token)) !== null;
  }

  /**
   * Troca a senha e derruba tudo que estava aberto.
   *
   * Derrubar as sessões é o ponto: quem redefine a senha costuma estar
   * redefinindo porque suspeita que alguém mais entrou. Deixar a sessão do
   * outro de pé seria trocar a fechadura e esquecer o invasor dentro de casa.
   */
  async redefinir(token: string, senhaNova: string, origem: Origem): Promise<boolean> {
    const registro = await this.achar(token);
    if (registro === null) return false;

    await this.prisma.$transaction([
      // Marcar antes de trocar, e na mesma transação: dois cliques no link não
      // podem gastar o mesmo token duas vezes.
      this.prisma.tokenDeRedefinicao.update({
        where: { id: registro.id },
        data: { usadoEm: new Date() },
      }),
      this.prisma.usuario.update({
        where: { id: registro.usuarioId },
        data: {
          senhaHash: await this.senhas.gerarHash(senhaNova),
          sessoesValidasDesde: new Date(),
          // A conta pode ter sido bloqueada por tentativas — foi o que levou a
          // pessoa a pedir o link. Redefinir com sucesso limpa a escada.
          tentativasFalhas: 0,
          bloqueadoAte: null,
        },
      }),
    ]);

    await this.auditoria.registrar({
      acao: 'SENHA_ALTERADA',
      usuarioId: registro.usuarioId,
      detalhe: { via: 'redefinicao' },
      ip: origem.ip,
      agenteDeUsuario: origem.agenteDeUsuario,
    });

    return true;
  }

  /** O registro vivo deste token, ou nulo. */
  private async achar(token: string): Promise<{ id: string; usuarioId: string } | null> {
    const limpo = token.trim();
    if (limpo === '') return null;

    const registro = await this.prisma.tokenDeRedefinicao.findUnique({
      where: { tokenHash: hashDo(limpo) },
      select: { id: true, usuarioId: true, expiraEm: true, usadoEm: true, tokenHash: true },
    });

    if (!registro || registro.usadoEm !== null || registro.expiraEm.getTime() <= Date.now()) {
      return null;
    }

    // A busca já foi por igualdade exata no índice; esta comparação em tempo
    // constante existe para o caminho não ficar dependendo de como o banco
    // compara — e custa nada sobre 64 caracteres.
    if (!iguais(registro.tokenHash, hashDo(limpo))) return null;

    return { id: registro.id, usuarioId: registro.usuarioId };
  }

  private linkDe(token: string): string {
    const raiz = this.config.get('URL_PUBLICA', { infer: true });
    if (!raiz) {
      // Chega aqui só se `configurado` disser que sim e a URL faltar. Avisa
      // alto: o e-mail vai sair com link quebrado.
      this.logger.error('URL_PUBLICA não configurada: o link do e-mail sairá relativo.');
    }

    return `${(raiz ?? '').replace(/\/$/, '')}/redefinir-senha?token=${encodeURIComponent(token)}`;
  }
}

function hashDo(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);

  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * O e-mail.
 *
 * Sem imagem e sem rastreador: é uma mensagem de segurança, e pixel de
 * abertura numa mensagem dessas só serve para o filtro de spam desconfiar.
 * E o texto diz o que fazer quando **não** foi a pessoa que pediu — é a única
 * pista que ela terá de que alguém está tentando a conta dela.
 */
function corpoDoEmail(nome: string, link: string): string {
  return [
    '<div style="font-family: system-ui, sans-serif; max-width: 520px; line-height: 1.5;">',
    `<p>Olá, ${escapar(nome)}.</p>`,
    '<p>Alguém pediu para redefinir a senha da sua conta na PharmoPet. Se foi você, abra o link abaixo. Ele vale por uma hora e só funciona uma vez.</p>',
    `<p><a href="${escapar(link)}">Redefinir minha senha</a></p>`,
    '<p style="color:#555;font-size:14px;">Se não foi você, ignore este e-mail: sua senha continua a mesma. Mas se isso se repetir, avise a administração da farmácia.</p>',
    '</div>',
  ].join('');
}

/** O nome vem do cadastro, e cadastro é texto que alguém digitou. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
