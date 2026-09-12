import { describe, expect, it, vi } from 'vitest';
import { ErroDeApi, criarClienteApi, exigir } from './cliente.js';

type Fetch = typeof globalThis.fetch;

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('criarClienteApi', () => {
  /**
   * O cliente do app nasce junto com o módulo. Se ele fixasse o `fetch` do
   * ambiente nesse instante, tudo que for instalado depois — service worker,
   * instrumentação, dublê de teste — passaria despercebido.
   */
  it('usa o fetch que estiver valendo na hora da chamada, não o da criação', async () => {
    const cliente = criarClienteApi({ baseUrl: 'https://api.exemplo' });

    const instaladoDepois = vi.fn<Fetch>(async () =>
      respostaJson({ status: 'ok', timestamp: '2026-09-12T10:00:00.000Z' }),
    );
    vi.stubGlobal('fetch', instaladoDepois);

    try {
      await cliente.GET('/api/v1/health');
      expect(instaladoDepois).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('monta a URL a partir da baseUrl e do caminho do contrato', async () => {
    const fetchFalso = vi.fn<Fetch>(async () =>
      respostaJson({ status: 'ok', timestamp: '2026-09-12T10:00:00.000Z' }),
    );
    const cliente = criarClienteApi({ baseUrl: 'https://api.exemplo', fetch: fetchFalso });

    await cliente.GET('/api/v1/health');

    const requisicao = fetchFalso.mock.calls[0]?.[0] as Request;
    expect(requisicao.url).toBe('https://api.exemplo/api/v1/health');
  });

  /**
   * A sessão é cookie httpOnly. Se o cliente parar de mandar credencial, toda
   * chamada autenticada passa a voltar 401 sem nenhum erro aparente no código.
   */
  it('envia a credencial de sessão', async () => {
    const fetchFalso = vi.fn<Fetch>(async () =>
      respostaJson({ status: 'ok', timestamp: '2026-09-12T10:00:00.000Z' }),
    );
    const cliente = criarClienteApi({ baseUrl: 'https://api.exemplo', fetch: fetchFalso });

    await cliente.GET('/api/v1/health');

    const requisicao = fetchFalso.mock.calls[0]?.[0] as Request;
    expect(requisicao.credentials).toBe('include');
  });
});

describe('exigir', () => {
  it('devolve o dado quando a chamada dá certo', async () => {
    const fetchFalso = async () =>
      respostaJson({ status: 'ok', timestamp: '2026-09-12T10:00:00.000Z' });
    const cliente = criarClienteApi({ baseUrl: 'https://api.exemplo', fetch: fetchFalso });

    const saude = await exigir(cliente.GET('/api/v1/health'));

    expect(saude.status).toBe('ok');
  });

  it('lança ErroDeApi com o status quando a API recusa', async () => {
    const fetchFalso = async () => respostaJson({ message: 'sem sessão' }, 401);
    const cliente = criarClienteApi({ baseUrl: 'https://api.exemplo', fetch: fetchFalso });

    const erro = await exigir(cliente.GET('/api/v1/health')).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDeApi);
    expect((erro as ErroDeApi).status).toBe(401);
    expect((erro as ErroDeApi).corpo).toEqual({ message: 'sem sessão' });
  });
});
