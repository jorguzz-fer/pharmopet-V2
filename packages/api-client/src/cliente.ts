import createClient from 'openapi-fetch';
import type { paths } from './gerado/api.js';

/**
 * Cliente da API.
 *
 * Os tipos não são escritos aqui: vêm de `gerado/api.ts`, que sai do
 * openapi.json publicado pela própria API. Caminho, corpo e resposta são
 * conferidos pelo compilador contra o contrato — se o servidor mudar e o
 * contrato for regerado, o que quebra aparece no typecheck, não em produção.
 */
export type ClienteApi = ReturnType<typeof createClient<paths>>;

export type OpcoesDoCliente = {
  /** Raiz da API, sem barra no fim. Ex.: https://api.pharmopet.com.br */
  baseUrl: string;
  /**
   * `fetch` alternativo. Existe para teste e para ambientes que precisam
   * instrumentar a chamada; em produção fica o do próprio runtime.
   */
  fetch?: typeof globalThis.fetch;
};

export function criarClienteApi({ baseUrl, fetch }: OpcoesDoCliente): ClienteApi {
  return createClient<paths>({
    baseUrl,
    // A sessão vive em cookie httpOnly: o navegador precisa mandá-lo junto.
    // Nenhum token trafega por JavaScript, então não há o que um XSS roubar.
    credentials: 'include',
    ...(fetch ? { fetch } : {}),
  });
}

/**
 * Falha vinda da API, já com o status à mão.
 *
 * `corpo` fica como `unknown` de propósito: o formato de erro é contrato, e
 * enquanto ele não estiver no OpenAPI ninguém deve fingir que o conhece.
 */
export class ErroDeApi extends Error {
  constructor(
    readonly status: number,
    readonly corpo: unknown,
  ) {
    super(`A API respondeu ${status}.`);
    this.name = 'ErroDeApi';
  }
}

type Resultado<T> = { data?: T; error?: unknown; response: Response };

/**
 * Desembrulha a resposta do openapi-fetch, que devolve `{ data, error }` em vez
 * de lançar. Útil onde o chamador quer o dado ou uma exceção — carregamento de
 * tela, por exemplo — em vez de tratar os dois ramos na mão.
 */
export async function exigir<T>(chamada: Promise<Resultado<T>>): Promise<T> {
  const { data, error, response } = await chamada;
  if (data !== undefined) return data;
  throw new ErroDeApi(response.status, error);
}
