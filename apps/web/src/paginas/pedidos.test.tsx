import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

type Fetch = typeof globalThis.fetch;

const VETERINARIO = {
  id: 'bb22f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Renata Mattos',
  email: 'renata@clinica.test',
  papel: 'VETERINARIO',
  crmv: 'SP 28.114',
};

const FARMACIA = {
  id: 'cc33f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Balcão Pharmopet',
  email: 'balcao@pharmopet.test',
  papel: 'FARMACIA',
  crmv: null,
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function pedido(sobre: Record<string, unknown> = {}) {
  return {
    id: 'pp88f4e0-0000-4000-8000-000000000001',
    numero: 4,
    estado: 'EM_ANALISE',
    destino: 'TUTOR',
    enderecoDeEntrega: 'Marina Prado — Rua das Acácias, 120 — Pinheiros · São Paulo · SP',
    observacoes: null,
    motivoDoCancelamento: null,
    receitaId: 'rr77f4e0-0000-4000-8000-000000000001',
    receitaNumero: 7,
    pacienteNome: 'Tobias',
    tutorNome: 'Marina Prado',
    clinicaNome: 'Vida Animal',
    veterinarioNome: 'Renata Mattos',
    enviadoPorNome: 'Renata Mattos',
    formulacoes: [
      {
        forma: 'CÁPSULAS',
        quantidade: 20,
        aroma: null,
        usoContinuo: false,
        itens: [{ descricao: 'Gabapentina', doseMg: 100 }],
      },
    ],
    valorTotalEmCentavos: 1846,
    criadoEm: '2026-09-13T12:00:00.000Z',
    producaoEm: null,
    prontoEm: null,
    entregueEm: null,
    ...sobre,
  };
}

function apiFalsa(respostas: Record<string, unknown> = {}, eu: unknown = FARMACIA) {
  const enviados: { url: string; corpo: unknown }[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada, init) => {
    const requisicao = entrada instanceof Request ? entrada : null;
    const url = String(requisicao ? requisicao.url : entrada);
    const metodo = requisicao?.method ?? init?.method ?? 'GET';

    if (metodo !== 'GET') {
      const texto = requisicao ? await requisicao.clone().text() : String(init?.body ?? '');
      enviados.push({ url, corpo: texto ? JSON.parse(texto) : undefined });
    }

    for (const [trecho, resposta] of Object.entries(respostas)) {
      if (url.includes(trecho)) return json(resposta);
    }

    if (url.includes('/auth/eu')) return json(eu);
    return json({}, 404);
  });

  return { fetchFalso, enviados };
}

function montar(caminho: string) {
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

describe('fila da farmácia', () => {
  it('mostra o que manipular e para onde vai', async () => {
    const { fetchFalso } = apiFalsa({ '/pedidos': { pedidos: [pedido()] } });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');

    expect(await screen.findByText('Pedido nº 4')).toBeInTheDocument();
    expect(screen.getByText('20 × CÁPSULAS')).toBeInTheDocument();
    expect(screen.getByText(/Gabapentina — 100 mg por dose/)).toBeInTheDocument();
    expect(screen.getByText(/Rua das Acácias, 120/)).toBeInTheDocument();
  });

  it('diz que a fila está vazia em vez de mostrar nada', async () => {
    const { fetchFalso } = apiFalsa({ '/pedidos': { pedidos: [] } });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');

    expect(await screen.findByText(/Nada na fila/)).toBeInTheDocument();
  });

  it('oferece só o próximo passo, e não a lista inteira de estados', async () => {
    const { fetchFalso } = apiFalsa({ '/pedidos': { pedidos: [pedido()] } });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');
    await screen.findByText('Pedido nº 4');

    // De EM_ANALISE só se vai para EM_PRODUCAO (ou cancelar). Oferecer
    // "Entregue" aqui seria um botão que o servidor recusa.
    expect(screen.getByRole('button', { name: 'Em produção' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pronto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entregue' })).not.toBeInTheDocument();
  });

  it('avança o pedido', async () => {
    const { fetchFalso, enviados } = apiFalsa({ '/pedidos': { pedidos: [pedido()] } });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');
    await userEvent.click(await screen.findByRole('button', { name: 'Em produção' }));

    await waitFor(() => expect(enviados.some((e) => e.url.includes('/estado'))).toBe(true));
    expect(enviados.find((e) => e.url.includes('/estado'))?.corpo).toEqual({
      estado: 'EM_PRODUCAO',
    });
  });

  it('não cancela sem motivo', async () => {
    const { fetchFalso, enviados } = apiFalsa({ '/pedidos': { pedidos: [pedido()] } });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));

    expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Por que está cancelando?'), 'Tutor desistiu.');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => expect(enviados.some((e) => e.url.includes('/estado'))).toBe(true));
    expect(enviados.find((e) => e.url.includes('/estado'))?.corpo).toEqual({
      estado: 'CANCELADO',
      motivo: 'Tutor desistiu.',
    });
  });

  it('um pedido entregue não oferece mais nada', async () => {
    const { fetchFalso } = apiFalsa({
      '/pedidos': { pedidos: [pedido({ estado: 'ENTREGUE', entregueEm: '2026-09-13T15:00:00Z' })] },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');
    await screen.findByText('Pedido nº 4');

    expect(screen.queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument();
    expect(screen.getByText('Entregue')).toBeInTheDocument();
  });

  it('quem prescreve não recebe os botões da bancada', async () => {
    const { fetchFalso } = apiFalsa({ '/pedidos': { pedidos: [pedido()] } }, VETERINARIO);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');
    await screen.findByText('Pedido nº 4');

    expect(screen.queryByRole('button', { name: 'Em produção' })).not.toBeInTheDocument();
    // Mas ainda pode desistir enquanto ninguém começou.
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
  });

  it('quem prescreve não cancela depois que a farmácia começou', async () => {
    const { fetchFalso } = apiFalsa(
      { '/pedidos': { pedidos: [pedido({ estado: 'EM_PRODUCAO' })] } },
      VETERINARIO,
    );
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');
    await screen.findByText('Pedido nº 4');

    expect(screen.queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument();
  });
});
