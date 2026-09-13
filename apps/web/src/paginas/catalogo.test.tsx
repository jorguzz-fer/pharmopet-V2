import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

/**
 * O painel do catálogo.
 *
 * O que estes testes guardam não é o desenho: é que a tela não ofereça salvar
 * um estado que a API recusa, e que ela não mostre número comercial a quem não
 * pode vê-lo.
 */

type Fetch = typeof globalThis.fetch;

const ADMIN = {
  id: 'aa11f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Marcos Pharmo',
  email: 'marcos@pharmopet.test',
  papel: 'ADMIN',
  crmv: null,
};

const GABAPENTINA = {
  id: 'dd44f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  codigo: '665',
  descricao: 'Gabapentina',
  controlado: false,
  listaDeControle: null,
  estoque: 'disponivel',
  formasProibidas: [],
};

/** O mesmo insumo, como a rota de administração o devolve: com os números. */
const GABAPENTINA_ADMIN = {
  ...GABAPENTINA,
  custoPorGramaEmMicro: 35_120,
  custoDeReferenciaPorGramaEmMicro: 35_120,
  markupEmCentesimos: 648,
  estoqueEmMiligramas: 500_000,
};

const PASTA = { id: 'ff55f4e0-0000-4000-8000-000000000001', nome: 'PASTA ORAL', aceitaAroma: true };

function json(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function apiFalsa(respostas: Record<string, unknown> = {}) {
  const enviados: { url: string; metodo: string; corpo: unknown }[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada, init) => {
    const pedido = entrada instanceof Request ? entrada : null;
    const url = String(pedido ? pedido.url : entrada);
    const metodo = pedido?.method ?? init?.method ?? 'GET';

    if (metodo !== 'GET') {
      const texto = pedido ? await pedido.clone().text() : String(init?.body ?? '');
      enviados.push({ url, metodo, corpo: texto ? JSON.parse(texto) : undefined });
      return new Response(null, { status: 204 });
    }

    for (const [trecho, resposta] of Object.entries(respostas)) {
      if (url.includes(trecho)) return json(resposta);
    }

    if (url.includes('/auth/eu')) return json(ADMIN);
    return json({});
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

// O insumo aberto vem antes da busca: as duas URLs começam igual, e o dublê
// casa por trecho, na ordem em que as chaves foram escritas.
const base = {
  [`/catalogo/insumos/${GABAPENTINA.id}`]: GABAPENTINA_ADMIN,
  '/catalogo/insumos': { insumos: [GABAPENTINA] },
  '/catalogo/formas': { formas: [PASTA] },
  '/catalogo/restricoes': { restricoes: [] },
};

describe('painel do catálogo', () => {
  it('diz como encher um catálogo vazio, em vez de só dizer que está vazio', async () => {
    const { fetchFalso } = apiFalsa({ '/catalogo/insumos': { insumos: [] } });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/catalogo');

    expect(await screen.findByText(/catalogo:importar/)).toBeInTheDocument();
  });

  it('abre um insumo e mostra os números comerciais, que a lista não traz', async () => {
    const { fetchFalso } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/catalogo');
    await userEvent.click(await screen.findByRole('button', { name: /Gabapentina/ }));

    // 35.120 micro-reais por grama são R$ 0,035120; 648 centésimos são 6,48×.
    expect(await screen.findByLabelText('Custo por grama (R$)')).toHaveValue('0.035120');
    expect(screen.getByLabelText('Markup (×)')).toHaveValue('6.48');
  });

  /**
   * A regra que a API passou a exigir: lista nula num controlado daria à
   * receita os 180 dias do prazo comum, em vez dos 30 da Portaria 344/98.
   */
  it('não deixa salvar controlado sem a lista de controle', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/catalogo');
    await userEvent.click(await screen.findByRole('button', { name: /Gabapentina/ }));
    await userEvent.click(await screen.findByLabelText('Controlado'));

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(await screen.findByText(/180 dias do prazo comum/)).toBeInTheDocument();
    expect(enviados).toHaveLength(0);
  });

  it('salva o controlado quando a lista vem junto', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/catalogo');
    await userEvent.click(await screen.findByRole('button', { name: /Gabapentina/ }));
    await userEvent.click(await screen.findByLabelText('Controlado'));
    await userEvent.type(await screen.findByLabelText('Lista de controle'), 'c1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.metodo).toBe('PATCH');
    expect(enviados[0]?.corpo).toMatchObject({ controlado: true, listaDeControle: 'C1' });
  });

  /**
   * Vazio é "não informado", e zero afirma falta. Mandar 0 por um campo em
   * branco encheria a tela de quem prescreve com aviso de falta inventado.
   */
  it('manda estoque nulo quando o campo fica em branco, e não zero', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/catalogo');
    await userEvent.click(await screen.findByRole('button', { name: /Gabapentina/ }));
    await userEvent.clear(await screen.findByLabelText('Estoque (mg)'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.corpo).toMatchObject({ estoqueEmMiligramas: null });
  });

  /** Markup zero virava preço zero em silêncio — a fase 3 corrigiu no motor. */
  it('não deixa salvar markup zerado', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/catalogo');
    await userEvent.click(await screen.findByRole('button', { name: /Gabapentina/ }));
    const markup = await screen.findByLabelText('Markup (×)');
    await userEvent.clear(markup);
    await userEvent.type(markup, '0');

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(enviados).toHaveLength(0);
  });

  it('a aba de controlados esconde quem não é controlado', async () => {
    const { fetchFalso } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/catalogo?aba=controlados');

    expect(await screen.findByText(/Nenhum insumo controlado/)).toBeInTheDocument();
  });

  it('lê a proibição como regra, com os dois lados por extenso', async () => {
    const { fetchFalso } = apiFalsa({
      ...base,
      '/catalogo/restricoes': {
        restricoes: [
          {
            insumoId: GABAPENTINA.id,
            insumoCodigo: '531',
            insumoDescricao: 'Pancreatina',
            formaId: PASTA.id,
            formaNome: 'PASTA ORAL',
            motivo: 'NÃO FAZ EM PASTA',
          },
        ],
      },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/catalogo?aba=restricoes');

    expect(await screen.findByText('Pancreatina')).toBeInTheDocument();
    expect(screen.getByText('não faz em')).toBeInTheDocument();
    expect(screen.getByText('PASTA ORAL')).toBeInTheDocument();
  });

  it('levanta uma proibição pelo par insumo e forma', async () => {
    const { fetchFalso, enviados } = apiFalsa({
      ...base,
      '/catalogo/restricoes': {
        restricoes: [
          {
            insumoId: GABAPENTINA.id,
            insumoCodigo: '531',
            insumoDescricao: 'Pancreatina',
            formaId: PASTA.id,
            formaNome: 'PASTA ORAL',
            motivo: 'NÃO FAZ EM PASTA',
          },
        ],
      },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/catalogo?aba=restricoes');
    await userEvent.click(await screen.findByRole('button', { name: 'Levantar' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.metodo).toBe('DELETE');
    expect(enviados[0]?.url).toContain(`/restricoes/${GABAPENTINA.id}/${PASTA.id}`);
  });
});
