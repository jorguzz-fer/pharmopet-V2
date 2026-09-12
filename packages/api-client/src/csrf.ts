import type { Middleware } from 'openapi-fetch';

/** Cookie legível pelo JavaScript onde a API põe o token anti-CSRF. */
export const COOKIE_CSRF = 'pharmopet_csrf';

/** Cabeçalho em que esse token precisa voltar. */
export const CABECALHO_CSRF = 'x-pharmopet-csrf';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Lê um cookie do documento. Fora do navegador, não há de onde ler. */
export function lerCookie(nome: string): string | null {
  if (typeof document === 'undefined') return null;

  for (const parte of document.cookie.split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }

  return null;
}

/**
 * Devolve o token anti-CSRF no cabeçalho, a cada mutação.
 *
 * O par funciona assim: o cookie de sessão é httpOnly e viaja sozinho, inclusive
 * num POST disparado por outro site — é o que torna CSRF possível. O cabeçalho,
 * não: só JavaScript da nossa origem consegue lê-lo do cookie e defini-lo. Um
 * formulário hospedado em outro domínio manda o cookie e não consegue mandar o
 * cabeçalho, e a API recusa.
 *
 * Fica no pacote do cliente, e não em cada tela, porque uma chamada que esqueça
 * disso falha com 403 e leva alguém a "consertar" afrouxando o servidor.
 */
export const antiCsrf: Middleware = {
  onRequest({ request }) {
    if (METODOS_SEGUROS.has(request.method)) return undefined;

    const token = lerCookie(COOKIE_CSRF);
    if (token) request.headers.set(CABECALHO_CSRF, token);

    return request;
  },
};
