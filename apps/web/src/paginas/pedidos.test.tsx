import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { esperaDesde } from '@/paginas/pedidos/Pedidos';
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

/**
 * O quadro (ADR 0014).
 *
 * O que estes guardam: que cada pedido caia na coluna do seu estado, que os
 * encerrados fiquem fora das três colunas do trabalho — senão a coluna que só
 * cresce empurra as que importam — e que o relógio do cartão diga há quanto
 * tempo aquilo espera, que é o que decide o que sai primeiro da bancada.
 */
describe('o quadro', () => {
  it('põe cada pedido na coluna do seu estado', async () => {
    const { fetchFalso } = apiFalsa(
      {
        '/pedidos': {
          pedidos: [
            pedido(),
            pedido({ id: 'p-2', numero: 5, estado: 'EM_PRODUCAO' }),
            pedido({ id: 'p-3', numero: 6, estado: 'PRONTO' }),
          ],
        },
      },
      FARMACIA,
    );
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');
    await screen.findByText('Pedido nº 4');

    const analise = within(screen.getByRole('region', { name: /Em análise/ }));
    const producao = within(screen.getByRole('region', { name: /Em produção/ }));
    const pronto = within(screen.getByRole('region', { name: /Pronto/ }));

    expect(analise.getByText('Pedido nº 4')).toBeInTheDocument();
    expect(producao.getByText('Pedido nº 5')).toBeInTheDocument();
    expect(pronto.getByText('Pedido nº 6')).toBeInTheDocument();

    // Nenhum aparece em duas colunas ao mesmo tempo.
    expect(analise.queryByText('Pedido nº 5')).not.toBeInTheDocument();
    expect(pronto.queryByText('Pedido nº 4')).not.toBeInTheDocument();
  });

  it('tira os encerrados das três colunas do trabalho', async () => {
    const { fetchFalso } = apiFalsa(
      {
        '/pedidos': {
          pedidos: [pedido(), pedido({ id: 'p-9', numero: 9, estado: 'ENTREGUE' })],
        },
      },
      FARMACIA,
    );
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');
    await screen.findByText('Pedido nº 9');

    for (const coluna of ['Em análise', 'Em produção', 'Pronto']) {
      const dentro = within(screen.getByRole('region', { name: new RegExp(coluna) }));
      expect(dentro.queryByText('Pedido nº 9')).not.toBeInTheDocument();
    }

    expect(
      within(screen.getByRole('region', { name: 'Encerrados' })).getByText('Pedido nº 9'),
    ).toBeInTheDocument();

    // E o resumo do topo conta só o que está em aberto.
    expect(screen.getByText(/1 pedido em aberto/)).toBeInTheDocument();
  });

  it('conta quantos há em cada coluna', async () => {
    const { fetchFalso } = apiFalsa(
      {
        '/pedidos': {
          pedidos: [pedido(), pedido({ id: 'p-2', numero: 5 })],
        },
      },
      FARMACIA,
    );
    vi.stubGlobal('fetch', fetchFalso);

    montar('/pedidos');
    await screen.findByText('Pedido nº 4');

    // O contador entra no nome acessível da coluna — quem ouve a tela sabe
    // quantos há sem percorrer os cartões um a um.
    expect(screen.getByRole('region', { name: /Em análise\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Pronto\s*0/ })).toBeInTheDocument();
  });
});

describe('há quanto tempo espera', () => {
  const AGORA = new Date('2026-09-14T12:00:00.000Z');

  it('conta em minutos, horas e dias, pela maior unidade que couber', () => {
    expect(esperaDesde('2026-09-14T11:47:00.000Z', AGORA).rotulo).toBe('13 min');
    expect(esperaDesde('2026-09-14T06:30:00.000Z', AGORA).rotulo).toBe('5 h');
    expect(esperaDesde('2026-09-11T09:00:00.000Z', AGORA).rotulo).toBe('3 d');
  });

  it('vira 1 h no minuto 60, e 1 d na hora 24', () => {
    expect(esperaDesde('2026-09-14T11:01:00.000Z', AGORA).rotulo).toBe('59 min');
    expect(esperaDesde('2026-09-14T11:00:00.000Z', AGORA).rotulo).toBe('1 h');
    expect(esperaDesde('2026-09-13T12:01:00.000Z', AGORA).rotulo).toBe('23 h');
    expect(esperaDesde('2026-09-13T12:00:00.000Z', AGORA).rotulo).toBe('1 d');
  });

  it('marca como demais só a partir de um dia', () => {
    // É o que pinta o relógio de vermelho no cartão. Antes de um dia na fila
    // não há nada de errado, e destacar tudo é não destacar nada.
    expect(esperaDesde('2026-09-14T01:00:00.000Z', AGORA).demais).toBe(false);
    expect(esperaDesde('2026-09-13T11:00:00.000Z', AGORA).demais).toBe(true);
  });

  it('não conta para trás quando o relógio do servidor está adiantado', () => {
    // Um pedido criado "no futuro" por dessincronia de relógio mostrava
    // "-3 min", que não quer dizer nada para quem está na bancada.
    expect(esperaDesde('2026-09-14T12:03:00.000Z', AGORA).rotulo).toBe('0 min');
  });
});
