import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Estado } from './Estado';

/**
 * Prova de ponta a ponta do encanamento do front: tokens → componentes →
 * cliente gerado do contrato → chamada HTTP. O `fetch` é o único ponto falso;
 * do caminho da URL para dentro, é tudo o código de produção.
 */

type Fetch = typeof globalThis.fetch;

function respostaDeSaude(timestamp: string): Response {
  return new Response(JSON.stringify({ status: 'ok', timestamp }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Estado da instalação', () => {
  it('mostra que está consultando antes da resposta chegar', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );

    render(<Estado />);

    expect(screen.getByText('Consultando…')).toBeInTheDocument();
  });

  it('chama o /health da API configurada', async () => {
    const fetchFalso = vi.fn<Fetch>(async () => respostaDeSaude('2026-09-12T13:45:07.000Z'));
    vi.stubGlobal('fetch', fetchFalso);

    render(<Estado />);
    await screen.findByText('Respondendo');

    const requisicao = fetchFalso.mock.calls[0]?.[0] as Request;
    expect(requisicao.url).toBe('http://api.teste/api/v1/health');
  });

  it('mostra o horário devolvido pela API, em formato brasileiro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaDeSaude('2026-09-12T13:45:07.000Z')),
    );

    render(<Estado />);

    // Formatado no fuso de quem abre a tela, então a asserção é sobre o padrão
    // (dd/mm/aaaa hh:mm:ss) e não sobre uma hora fixa.
    expect(
      await screen.findByText(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}:\d{2}$/),
    ).toBeInTheDocument();
  });

  it('explica a falha quando a API não responde, e deixa tentar de novo', async () => {
    const fetchFalso = vi
      .fn<Fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(respostaDeSaude('2026-09-12T13:45:07.000Z'));
    vi.stubGlobal('fetch', fetchFalso);

    render(<Estado />);

    expect(await screen.findByText('Não foi possível falar com a API.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Respondendo')).toBeInTheDocument();
  });

  it('mostra o status quando a API recusa a chamada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'sem sessão' }), { status: 401 })),
    );

    render(<Estado />);

    expect(await screen.findByText('A API respondeu 401.')).toBeInTheDocument();
  });
});
