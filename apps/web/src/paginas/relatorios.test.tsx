import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

/**
 * A tela de relatórios.
 *
 * O que estes testes guardam: que a tela diga **valor prescrito**, nunca
 * faturamento (ADR 0017); que a participação de cada linha não vire `NaN%`
 * num mês de total zero; e que a aba não apareça para quem prescreve, que
 * veria o movimento dos colegas.
 */

type Fetch = typeof globalThis.fetch;

const EU: { id: string; nome: string; email: string; papel: string; crmv: string | null } = {
  id: 'aa11f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Marcos Pharmo',
  email: 'marcos@pharmopet.test',
  papel: 'ADMIN',
  crmv: null,
};

const RELATORIO = {
  mes: '2026-09',
  receitas: 3,
  valorEmCentavos: 30_000,
  porVeterinario: [
    {
      id: 'v-1',
      nome: 'Renata Mattos',
      detalhe: 'SP 28.114',
      receitas: 2,
      valorEmCentavos: 20_000,
    },
    { id: 'v-2', nome: 'Caio Brandão', detalhe: null, receitas: 1, valorEmCentavos: 10_000 },
  ],
  porClinica: [
    { id: 'c-1', nome: 'Vida Animal', detalhe: null, receitas: 2, valorEmCentavos: 20_000 },
    {
      id: null,
      nome: 'Sem clínica (atendimento próprio)',
      detalhe: null,
      receitas: 1,
      valorEmCentavos: 10_000,
    },
  ],
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function apiFalsa(relatorio: unknown = RELATORIO, eu: typeof EU = EU) {
  const urls: string[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    urls.push(url);

    if (url.includes('/relatorios/prescricoes')) return json(relatorio);
    if (url.includes('/auth/eu')) return json(eu);
    if (url.includes('/painel')) {
      return json({
        rascunhos: 0,
        emitidasNoMes: 0,
        vencendo: 0,
        valorPrescritoNoMesEmCentavos: 0,
        fila: null,
        topVeterinarios: null,
        ultimas: [],
      });
    }
    if (url.includes('/receituario/receitas')) return json({ receitas: [] });
    return json({});
  });

  return { fetchFalso, urls };
}

function montar(caminho = '/relatorios') {
  const router = createMemoryRouter(rotas, { initialEntries: [caminho] });
  render(
    <ProvedorDeSessao>
      <RouterProvider router={router} />
    </ProvedorDeSessao>,
  );
  return router;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('os totais', () => {
  it('mostra quantas e quanto', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    expect(await screen.findByText('Receitas emitidas')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('R$ 300,00')).toBeInTheDocument();
  });

  /** O ponto da ADR 0017, repetido aqui porque é aqui que alguém "melhoraria". */
  it('chama de valor prescrito, e diz que não é o que foi pago', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await screen.findByText('Receitas emitidas');

    // Aparece duas vezes — no cartão e no cabeçalho da tabela — e as duas
    // são deliberadas; o que não pode aparecer é "faturamento".
    expect(screen.getAllByText(/^Valor prescrito$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Não é o que foi pago/i)).toBeInTheDocument();
    expect(screen.queryByText(/faturamento/i)).not.toBeInTheDocument();
  });
});

describe('as quebras', () => {
  it('traz as duas, com nome, receitas e valor', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await screen.findByText('Por veterinário');

    expect(screen.getByText('Por clínica')).toBeInTheDocument();
    expect(screen.getByText('Renata Mattos')).toBeInTheDocument();
    expect(screen.getByText('SP 28.114')).toBeInTheDocument();
    expect(screen.getByText('Vida Animal')).toBeInTheDocument();
  });

  it('o atendimento sem clínica aparece como linha, e não some', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    // Se sumisse, a quebra não fecharia com o total e o relatório não
    // serviria para acertar conta.
    expect(await screen.findByText(/Sem clínica/)).toBeInTheDocument();
  });

  it('mostra a participação de cada linha no total', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await screen.findByText('Renata Mattos');

    // 20.000 de 30.000.
    expect(screen.getAllByText('66,7%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('33,3%').length).toBeGreaterThan(0);
  });

  /** Mês em que tudo saiu zerado existe, e `NaN%` na tela não ajuda ninguém. */
  it('não mostra NaN quando o total é zero', async () => {
    const { fetchFalso } = apiFalsa({
      ...RELATORIO,
      valorEmCentavos: 0,
      porVeterinario: [
        { id: 'v-1', nome: 'Renata Mattos', detalhe: null, receitas: 1, valorEmCentavos: 0 },
      ],
      porClinica: [],
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await screen.findByText('Renata Mattos');

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('o CRMV ausente vira travessão, e não vazio', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    const linha = (await screen.findByText('Caio Brandão')).closest('tr');

    expect(within(linha!).getByText('—')).toBeInTheDocument();
  });
});

describe('o mês', () => {
  it('começa no mês corrente', async () => {
    const { fetchFalso, urls } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await screen.findByText('Receitas emitidas');

    const agora = new Date();
    const esperado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

    expect(screen.getByLabelText('Mês')).toHaveValue(esperado);
    expect(urls.some((u) => u.includes(`mes=${esperado}`))).toBe(true);
  });

  it('trocar o mês recarrega o relatório daquele mês', async () => {
    const { fetchFalso, urls } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await screen.findByText('Receitas emitidas');

    await userEvent.clear(screen.getByLabelText('Mês'));
    await userEvent.type(screen.getByLabelText('Mês'), '2026-03');

    await vi.waitFor(() => {
      expect(urls.some((u) => u.includes('mes=2026-03'))).toBe(true);
    });
  });
});

describe('a planilha', () => {
  it('é um link para a rota .csv, com o mês', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    const link = await screen.findByRole('link', { name: 'Baixar planilha' });

    // Link e não botão: o download vai por navegação de topo, que leva o
    // cookie `SameSite=Lax` junto.
    expect(link.getAttribute('href')).toContain('/api/v1/relatorios/prescricoes.csv');
    expect(link.getAttribute('href')).toContain('mes=');
  });
});

describe('mês sem movimento', () => {
  it('diz que não houve, em vez de mostrar tabelas vazias', async () => {
    const { fetchFalso } = apiFalsa({
      mes: '2026-09',
      receitas: 0,
      valorEmCentavos: 0,
      porVeterinario: [],
      porClinica: [],
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    expect(await screen.findByText('Nenhuma receita emitida neste mês.')).toBeInTheDocument();
    expect(screen.queryByText('Por veterinário')).not.toBeInTheDocument();
  });
});

describe('quem vê a aba', () => {
  it('a administração vê', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    const lateral = within(await screen.findByRole('navigation', { name: 'Seções' }));
    lateral.getByRole('link', { name: 'Relatórios' });
  });

  it('a farmácia vê — é quem fecha conta', async () => {
    const { fetchFalso } = apiFalsa(RELATORIO, { ...EU, papel: 'FARMACIA' });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    const lateral = within(await screen.findByRole('navigation', { name: 'Seções' }));
    lateral.getByRole('link', { name: 'Relatórios' });
  });

  it('o veterinário não vê', async () => {
    const { fetchFalso } = apiFalsa(RELATORIO, { ...EU, papel: 'VETERINARIO', crmv: 'SP 1' });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    // Espera a navegação existir antes de afirmar que uma aba não está nela —
    // senão o teste passaria por a tela ainda não ter carregado.
    const lateral = within(await screen.findByRole('navigation', { name: 'Seções' }));
    lateral.getByRole('link', { name: 'Tutores' });

    expect(lateral.queryByRole('link', { name: 'Relatórios' })).not.toBeInTheDocument();
    // E também não pela barra do celular, que mostra outro recorte de abas.
    const doCelular = within(screen.getByRole('navigation', { name: 'Seções principais' }));
    expect(doCelular.queryByRole('link', { name: 'Relatórios' })).not.toBeInTheDocument();
  });
});
