import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

/**
 * O que cada papel lê quando a lista está vazia.
 *
 * Um vazio que manda clicar num botão que aquele papel não enxerga é pior do
 * que um vazio mudo: quem lê procura na tela a ação prometida, não acha, e
 * conclui que o app está quebrado. Foi o que aconteceu — a tela de Clínicas
 * mandava a farmácia começar por "Nova clínica", que só o ADMIN tem.
 */

type Fetch = typeof globalThis.fetch;
type Papel = 'ADMIN' | 'VETERINARIO' | 'FARMACIA' | 'CLINICA';

function json(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function montar(caminho: string, papel: Papel, respostas: Record<string, unknown>) {
  const eu = {
    id: 'aa11f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
    nome: 'Quem Está',
    email: 'quem@pharmopet.test',
    papel,
    crmv: null,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn<Fetch>(async (entrada) => {
      const url = String(entrada instanceof Request ? entrada.url : entrada);
      if (url.includes('/auth/eu')) return json(eu);

      for (const [trecho, resposta] of Object.entries(respostas)) {
        if (url.includes(trecho)) return json(resposta);
      }

      return json({});
    }),
  );

  const router = createMemoryRouter(rotas, { initialEntries: [caminho] });
  return render(
    <ProvedorDeSessao>
      <RouterProvider router={router} />
    </ProvedorDeSessao>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lista de clínicas vazia', () => {
  const semClinica = { '/clinicas': { clinicas: [] } };

  it('manda o ADMIN cadastrar, porque ele tem o botão', async () => {
    montar('/clinicas', 'ADMIN', semClinica);

    expect(await screen.findByText(/Comece por “Nova clínica”/)).toBeInTheDocument();
  });

  it('não manda a farmácia cadastrar: ela vê a lista e não o botão', async () => {
    montar('/clinicas', 'FARMACIA', semClinica);

    expect(await screen.findByText(/administração da Pharmopet/)).toBeInTheDocument();
    expect(screen.queryByText(/Comece por “Nova clínica”/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova clínica' })).not.toBeInTheDocument();
  });
});

describe('lista de receitas vazia', () => {
  const semReceita = { '/receituario/receitas': { receitas: [] } };

  it('manda o veterinário à ficha do tutor, que é de onde ele prescreve', async () => {
    montar('/receitas', 'VETERINARIO', semReceita);

    expect(await screen.findByText(/Comece pela ficha de um tutor/)).toBeInTheDocument();
  });

  /** A farmácia não tem a aba Tutores: mandá-la lá é mandá-la a lugar nenhum. */
  it('explica à farmácia que a receita chega, em vez de mandá-la abrir uma', async () => {
    montar('/receitas', 'FARMACIA', semReceita);

    expect(await screen.findByText(/quando um veterinário emitir/)).toBeInTheDocument();
    expect(screen.queryByText(/Comece pela ficha de um tutor/)).not.toBeInTheDocument();
  });

  /** O ADMIN vê a aba Tutores, mas quem emite receita é só o VETERINARIO. */
  it('não promete ao administrador uma ação que a API recusa dele', async () => {
    montar('/receitas', 'ADMIN', semReceita);

    expect(await screen.findByText(/Quem prescreve é o veterinário/)).toBeInTheDocument();
  });
});
