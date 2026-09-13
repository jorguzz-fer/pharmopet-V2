import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

/**
 * O bulário é referência de consulta (ADR 0015). O que estes testes guardam: a
 * busca chegar ao servidor com os filtros certos, a lista não mentir sobre
 * quantas existem, e a tela dizer que o que está ali não é prescrição.
 */

type Fetch = typeof globalThis.fetch;

const EU = {
  id: 'aa11f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Renata Mattos',
  email: 'renata@clinica.test',
  papel: 'VETERINARIO',
  crmv: 'SP 28.114',
};

const OTOLOGICA = {
  id: 'bb22f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  numero: '4.2',
  titulo: 'Solução Otológica de Cetoconazol',
  linhaTerapeutica: 'Otológica',
  linhaExclusiva: null,
  formaFarmaceutica: 'Solução otológica',
  indicacao: 'Otite externa por Malassezia.',
  especies: ['CANINO'],
};

const COMPLETA = {
  ...OTOLOGICA,
  diferencial: 'Veículo que não macera o conduto.',
  composicao: '• Cetoconazol 1%\n• Veículo otológico q.s.p. 30 mL',
  modoDeUsar: 'Instilar 5 gotas a cada 12 horas.',
  observacoes: null,
};

function json(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function apiFalsa(lista: { formulacoes: unknown[]; total: number }) {
  const urls: string[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    urls.push(url);

    if (url.includes('/auth/eu')) return json(EU);
    if (url.includes('/bulario/linhas')) {
      return json({
        linhas: [
          { nome: 'Otológica', quantidade: 25 },
          { nome: 'Dermatológica', quantidade: 87 },
        ],
      });
    }
    if (url.includes(`/bulario/${OTOLOGICA.id}`)) return json(COMPLETA);
    if (url.includes('/bulario')) return json(lista);
    return json({});
  });

  return { fetchFalso, urls };
}

function montar(caminho = '/bulario') {
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

describe('bulário', () => {
  it('lista as formulações com linha, espécie e indicação', async () => {
    const { fetchFalso } = apiFalsa({ formulacoes: [OTOLOGICA], total: 1 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    await screen.findByText('Solução Otológica de Cetoconazol');
    // Dentro do item da lista: "Cão" e "Otológica" também aparecem como opções
    // dos filtros, e uma asserção solta pegaria a opção em vez do selo.
    const item = screen.getByRole('button', { name: /Cetoconazol/ });

    expect(item).toHaveTextContent('4.2');
    expect(item).toHaveTextContent('Otológica');
    expect(item).toHaveTextContent('Cão');
    expect(item).toHaveTextContent('Otite externa por Malassezia.');
  });

  it('manda a busca ao servidor, e não filtra na memória', async () => {
    const { fetchFalso, urls } = apiFalsa({ formulacoes: [OTOLOGICA], total: 1 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await screen.findByText('Solução Otológica de Cetoconazol');
    await userEvent.type(screen.getByLabelText('Buscar'), 'otite');

    await vi.waitFor(() => {
      expect(urls.some((u) => u.includes('busca=otite'))).toBe(true);
    });
  });

  it('manda o filtro de espécie junto', async () => {
    const { fetchFalso, urls } = apiFalsa({ formulacoes: [OTOLOGICA], total: 1 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await screen.findByText('Solução Otológica de Cetoconazol');
    await userEvent.selectOptions(screen.getByLabelText('Espécie'), 'FELINO');

    await vi.waitFor(() => {
      expect(urls.some((u) => u.includes('especie=FELINO'))).toBe(true);
    });
  });

  it('oferece as linhas terapêuticas com a contagem de cada uma', async () => {
    const { fetchFalso } = apiFalsa({ formulacoes: [OTOLOGICA], total: 1 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    expect(await screen.findByRole('option', { name: 'Dermatológica (87)' })).toBeInTheDocument();
  });

  /**
   * O servidor devolve no máximo cinquenta. Dizer "50 formulações" quando são
   * 87 seria número errado numa tela cuja função é dizer o que existe.
   */
  it('diz o total, e avisa quando está mostrando só uma parte', async () => {
    const { fetchFalso } = apiFalsa({ formulacoes: [OTOLOGICA], total: 87 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    expect(await screen.findByText(/87 formulações/)).toBeInTheDocument();
    expect(screen.getByText(/mostrando as 1 primeiras/)).toBeInTheDocument();
  });

  it('não avisa de corte quando a lista está inteira', async () => {
    const { fetchFalso } = apiFalsa({ formulacoes: [OTOLOGICA], total: 1 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    expect(await screen.findByText('1 formulação')).toBeInTheDocument();
    expect(screen.queryByText(/mostrando as/)).not.toBeInTheDocument();
  });

  it('abre a formulação e mostra a composição do guia', async () => {
    const { fetchFalso } = apiFalsa({ formulacoes: [OTOLOGICA], total: 1 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Cetoconazol/ }));

    expect(await screen.findByText('Composição')).toBeInTheDocument();
    expect(screen.getByText(/Cetoconazol 1%/)).toBeInTheDocument();
    expect(screen.getByText(/Instilar 5 gotas/)).toBeInTheDocument();
  });

  /**
   * O mal-entendido mais caro desta tela seria alguém transcrever a composição
   * para a receita achando que é prescrição. Parte das formulações é dosada em
   * percentual da preparação, e o preço não sai dessa conta.
   */
  it('avisa que o guia não é prescrição para o paciente', async () => {
    const { fetchFalso } = apiFalsa({ formulacoes: [OTOLOGICA], total: 1 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Cetoconazol/ }));

    expect(await screen.findByText(/não valem como prescrição/)).toBeInTheDocument();
  });

  it('diz como encher um bulário vazio, em vez de só dizer que está vazio', async () => {
    const { fetchFalso } = apiFalsa({ formulacoes: [], total: 0 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    expect(await screen.findByText(/bulario:importar/)).toBeInTheDocument();
  });

  it('diz outra coisa quando o vazio veio de uma busca', async () => {
    const { fetchFalso } = apiFalsa({ formulacoes: [], total: 0 });
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await screen.findByText(/bulario:importar/);
    await userEvent.type(screen.getByLabelText('Buscar'), 'zzz');

    expect(await screen.findByText(/termo mais curto/)).toBeInTheDocument();
  });
});
