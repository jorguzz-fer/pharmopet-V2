import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Papel, Sessao, Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Quem está fazendo a requisição, já resolvido a partir da sessão. */
export type UsuarioAutenticado = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  crmv: string | null;
  sessaoId: string;
  csrfToken: string;
};

export type SessaoCriada = {
  /** Vai no cookie httpOnly. Depois desta função, não existe mais em lugar nenhum. */
  token: string;
  csrfToken: string;
  expiraEm: Date;
};

/** 32 bytes de aleatoriedade criptográfica em base64url. */
function segredo(): string {
  return randomBytes(32).toString('base64url');
}

function impressao(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessaoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Abre uma sessão.
   *
   * O token vai inteiro para o cookie e só o SHA-256 dele fica no banco. Não é
   * exagero: quem conseguir ler a tabela — um dump, um backup mal guardado, uma
   * injeção — leva hashes, não sessões utilizáveis. Como o token já é 32 bytes
   * aleatórios, não há dicionário a montar contra ele, e por isso um hash rápido
   * basta aqui (ao contrário da senha, que é curta e escolhida por gente).
   */
  async abrir(
    usuarioId: string,
    duracaoHoras: number,
    origem: { ip?: string; agenteDeUsuario?: string },
  ): Promise<SessaoCriada> {
    const token = segredo();
    const csrfToken = segredo();
    const expiraEm = new Date(Date.now() + duracaoHoras * 60 * 60 * 1000);

    await this.prisma.sessao.create({
      data: {
        usuarioId,
        tokenHash: impressao(token),
        csrfToken,
        expiraEm,
        ip: origem.ip ?? null,
        agenteDeUsuario: origem.agenteDeUsuario ?? null,
      },
    });

    return { token, csrfToken, expiraEm };
  }

  /**
   * Resolve o token do cookie no usuário por trás dele, ou `null`.
   *
   * Cada condição abaixo é uma forma de a sessão ter deixado de valer, e todas
   * precisam ser checadas aqui — é o único ponto do sistema que transforma um
   * cookie em identidade.
   */
  async resolver(token: string): Promise<UsuarioAutenticado | null> {
    const sessao = await this.prisma.sessao.findUnique({
      where: { tokenHash: impressao(token) },
      include: { usuario: true },
    });

    if (!sessao) return null;
    if (!this.estaValida(sessao, sessao.usuario)) return null;

    // Só grava o uso quando já passou um minuto: sem isso, toda requisição
    // viraria uma escrita, e uma tela que faz cinco chamadas pagaria cinco.
    if (Date.now() - sessao.ultimoUsoEm.getTime() > 60_000) {
      await this.prisma.sessao.update({
        where: { id: sessao.id },
        data: { ultimoUsoEm: new Date() },
      });
    }

    return {
      id: sessao.usuario.id,
      nome: sessao.usuario.nome,
      email: sessao.usuario.email,
      papel: sessao.usuario.papel,
      crmv: sessao.usuario.crmv,
      sessaoId: sessao.id,
      csrfToken: sessao.csrfToken,
    };
  }

  private estaValida(sessao: Sessao, usuario: Usuario): boolean {
    const agora = Date.now();

    if (sessao.revogadaEm !== null) return false;
    if (sessao.expiraEm.getTime() <= agora) return false;
    if (usuario.desativadoEm !== null) return false;

    // Troca de senha e revogação em massa não apagam sessão: movem esta data
    // para frente. Toda sessão aberta antes dela morre na conferência seguinte,
    // numa escrita só, sem varrer a tabela.
    if (sessao.criadaEm.getTime() < usuario.sessoesValidasDesde.getTime()) return false;

    return true;
  }

  /** Fecha uma sessão específica. Idempotente: sair duas vezes não é erro. */
  async revogar(sessaoId: string): Promise<void> {
    await this.prisma.sessao.updateMany({
      where: { id: sessaoId, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });
  }

  /**
   * Derruba tudo que estiver aberto para um usuário.
   *
   * Usado na troca de senha: se a senha vazou, quem estava usando a conta perde
   * o acesso no mesmo instante — é o "revogação imediata" que o blueprint pede e
   * que um JWT não entrega.
   */
  async revogarTodasDe(usuarioId: string): Promise<void> {
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { sessoesValidasDesde: new Date() },
    });
  }

  /**
   * Compara o token anti-CSRF em tempo constante.
   *
   * Comparar com `===` vaza, pelo tempo de resposta, quantos caracteres iniciais
   * estavam certos — o bastante para descobrir o token um caractere por vez.
   */
  confereCsrf(esperado: string, recebido: string | undefined): boolean {
    if (!recebido) return false;

    const a = Buffer.from(esperado);
    const b = Buffer.from(recebido);
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
  }
}
