import type { Request } from 'express';
import type { UsuarioAutenticado } from './sessao.service';

/** Nome do cookie com o segredo da sessão. httpOnly — o JavaScript não o vê. */
export const COOKIE_SESSAO = 'pharmopet_sessao';

/**
 * Cookie com o token anti-CSRF. Este é legível pelo JavaScript de propósito: a
 * página precisa lê-lo para devolvê-lo no cabeçalho, e é a coincidência dos dois
 * que um site de terceiros não consegue produzir.
 */
export const COOKIE_CSRF = 'pharmopet_csrf';

export const CABECALHO_CSRF = 'x-pharmopet-csrf';

/** Requisição depois de o guard de sessão ter resolvido quem está chamando. */
export type RequisicaoComUsuario = Request & { usuario?: UsuarioAutenticado };

/** IP e agente, para a auditoria e para a pessoa reconhecer a própria sessão. */
export function origemDa(requisicao: Request): { ip?: string; agenteDeUsuario?: string } {
  return {
    ip: requisicao.ip,
    // Cortado: o cabeçalho é livre e um cliente hostil mandaria megabytes.
    agenteDeUsuario: requisicao.get('user-agent')?.slice(0, 255),
  };
}
