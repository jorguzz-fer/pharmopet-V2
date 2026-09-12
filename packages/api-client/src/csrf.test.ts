import { afterEach, describe, expect, it, vi } from 'vitest';
import { CABECALHO_CSRF, COOKIE_CSRF, lerCookie } from './csrf.js';
import { criarClienteApi } from './cliente.js';

type Fetch = typeof globalThis.fetch;

function respostaVazia(): Response {
  return new Response(null, { status: 204 });
}

function comCookies(valor: string): void {
  vi.stubGlobal('document', { cookie: valor });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lerCookie', () => {
  it('acha o cookie no meio dos outros', () => {
    comCookies('a=1; pharmopet_csrf=abc123; z=9');

    expect(lerCookie(COOKIE_CSRF)).toBe('abc123');
  });

  it('não confunde com um cookie de nome parecido', () => {
    comCookies('pharmopet_csrf_antigo=errado; pharmopet_csrf=certo');

    expect(lerCookie(COOKIE_CSRF)).toBe('certo');
  });

  it('devolve nulo quando não há document — o pacote também roda fora do navegador', () => {
    vi.stubGlobal('document', undefined);

    expect(lerCookie(COOKIE_CSRF)).toBeNull();
  });
});

describe('anti-CSRF', () => {
  it('manda o token no cabeçalho a cada mutação', async () => {
    comCookies(`${COOKIE_CSRF}=abc123`);
    const fetchFalso = vi.fn<Fetch>(async () => respostaVazia());
    const cliente = criarClienteApi({ baseUrl: 'https://api.exemplo', fetch: fetchFalso });

    await cliente.POST('/api/v1/auth/sair');

    const requisicao = fetchFalso.mock.calls[0]?.[0] as Request;
    expect(requisicao.headers.get(CABECALHO_CSRF)).toBe('abc123');
  });

  /**
   * Mandar em GET não protegeria nada e vazaria o token para qualquer log de
   * proxy que registre cabeçalhos de leitura.
   */
  it('não manda em leitura', async () => {
    comCookies(`${COOKIE_CSRF}=abc123`);
    const fetchFalso = vi.fn<Fetch>(async () => respostaVazia());
    const cliente = criarClienteApi({ baseUrl: 'https://api.exemplo', fetch: fetchFalso });

    await cliente.GET('/api/v1/health');

    const requisicao = fetchFalso.mock.calls[0]?.[0] as Request;
    expect(requisicao.headers.get(CABECALHO_CSRF)).toBeNull();
  });

  it('segue sem o cabeçalho quando não há cookie — quem recusa é o servidor', async () => {
    comCookies('');
    const fetchFalso = vi.fn<Fetch>(async () => respostaVazia());
    const cliente = criarClienteApi({ baseUrl: 'https://api.exemplo', fetch: fetchFalso });

    await cliente.POST('/api/v1/auth/sair');

    expect(fetchFalso).toHaveBeenCalledOnce();
  });
});
