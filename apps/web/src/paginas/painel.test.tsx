import { render, screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

/**
 * O painel (ADR 0017).
 *
 * O que estes testes guardam: que o cartão de dinheiro **não** diga
 * "faturamento" — é a soma das receitas emitidas, e ninguém pagou nada ainda;
 * que os blocos de quem vê tudo não apareçam para quem não vê; e que a raiz da
 * aplicação seja o painel, com a lista de receitas em `/receitas`.
 */

type Fetch = typeof globalThis.fetch;

/** `crmv` anulável porque farmácia e administração não têm um, e entram nos testes. */
const EU: { id: string; nome: string; email: string; papel: string; crmv: string | null } = {
  id: 'aa11f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Renata Mattos',
  email: 'renata@clinica.test',
  papel: 'VETERINARIO',
  crmv: 'SP 28.114',
};

const VAZIO = {
  rascunhos: 0,
  emitidasNoMes: 0,
  vencendo: 0,
  valorPrescritoNoMesEmCentavos: 0,
  fila: null as null | { estado: string; quantidade: number }[],
  topVeterinarios: null as
    null | { id: string; nome: string; crmv: string | null; receitas: number }[],
  ultimas: [] as unknown[],
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function apiFalsa(painel: Partial<typeof VAZIO> = {}, eu: typeof EU = EU) {
  const fetchFalso = vi.fn<Fetch>(async (entrada) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);

    if (url.includes('/painel')) return json({ ...VAZIO, ...painel });
    if (url.includes('/auth/eu')) return json(eu);
    if (url.includes('/receituario/receitas')) return json({ receitas: [] });
    return json({});
  });

  return { fetchFalso };
}

function montar(caminho = '/') {
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

describe('a raiz da aplicação', () => {
  it('é o painel, e não mais a lista de receitas', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');

    expect(await screen.findByRole('heading', { name: /Olá, Renata/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Receitas' })).not.toBeInTheDocument();
  });

  it('a lista de receitas continua existindo, em /receitas', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas');

    expect(await screen.findByRole('heading', { name: 'Receitas' })).toBeInTheDocument();
  });

  it('a navegação oferece as duas', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: /Olá, Renata/ });

    // Escopado à lateral porque a barra inferior do celular repete os mesmos
    // destinos. No navegador só uma das duas está desenhada — o jsdom não
    // aplica CSS, então vê as duas, e sem o escopo o teste só diria que há
    // mais de um link chamado "Painel".
    const lateral = within(screen.getByRole('navigation', { name: 'Seções' }));

    expect(lateral.getByRole('link', { name: 'Painel' })).toHaveAttribute('href', '/');
    expect(lateral.getByRole('link', { name: 'Receitas' })).toHaveAttribute('href', '/receitas');
  });

  it('a barra do celular leva aos mesmos lugares, com nome próprio', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: /Olá, Renata/ });

    // Duas navegações com o mesmo nome acessível deixam quem navega por marcos
    // sem saber qual é qual.
    const doCelular = within(screen.getByRole('navigation', { name: 'Seções principais' }));

    expect(doCelular.getByRole('link', { name: 'Painel' })).toHaveAttribute('href', '/');
    expect(doCelular.getByRole('link', { name: 'Pedidos' })).toHaveAttribute('href', '/pedidos');
  });

  it('mostra quem entrou uma vez só', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: /Olá, Renata/ });

    // A moldura já teve o bloco do usuário em dois lugares — rodapé da lateral
    // e topo do celular —, um escondido por CSS. Leitor de tela que ignore o
    // `display:none` lia o nome duas vezes.
    expect(screen.getAllByText('Renata Mattos')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Sair' })).toHaveLength(1);
  });
});

describe('os números', () => {
  it('mostra o que está aberto', async () => {
    const { fetchFalso } = apiFalsa({ rascunhos: 3, emitidasNoMes: 12, vencendo: 2 });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: /Olá, Renata/ });

    expect(screen.getByText('Rascunhos').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Emitidas no mês').parentElement).toHaveTextContent('12');
    expect(screen.getByText('Vencem em 7 dias').parentElement).toHaveTextContent('2');
  });

  /**
   * O ponto da ADR 0017. A v1 mostrava "Faturamento (Mês)" somando todo
   * orçamento criado — pago ou não. Aqui não há meio de pagamento, então o
   * cartão diz o que de fato é, e este teste cai se alguém "melhorar" o
   * rótulo.
   */
  it('chama de valor prescrito, e diz que não é o que foi pago', async () => {
    const { fetchFalso } = apiFalsa({ valorPrescritoNoMesEmCentavos: 123_45 });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: /Olá, Renata/ });

    expect(screen.getByText('Valor prescrito no mês')).toBeInTheDocument();
    expect(screen.getByText(/Não é o que foi pago/i)).toBeInTheDocument();
    expect(screen.queryByText(/faturamento/i)).not.toBeInTheDocument();
    expect(screen.getByText('R$ 123,45')).toBeInTheDocument();
  });

  it('leva aos rascunhos, em vez de só dizer quantos são', async () => {
    const { fetchFalso } = apiFalsa({ rascunhos: 3 });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: /Olá, Renata/ });

    expect(screen.getByRole('link', { name: /Rascunhos/ })).toHaveAttribute('href', '/receitas');
  });
});

describe('os blocos de quem vê tudo', () => {
  it('não aparecem para o veterinário', async () => {
    const { fetchFalso } = apiFalsa({ fila: null, topVeterinarios: null });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: /Olá, Renata/ });

    expect(screen.queryByText('Fila da farmácia')).not.toBeInTheDocument();
    expect(screen.queryByText('Quem mais prescreveu no mês')).not.toBeInTheDocument();
  });

  it('aparecem para a farmácia, com os três degraus', async () => {
    const { fetchFalso } = apiFalsa(
      {
        fila: [
          { estado: 'EM_ANALISE', quantidade: 4 },
          { estado: 'EM_PRODUCAO', quantidade: 1 },
          { estado: 'PRONTO', quantidade: 0 },
        ],
        topVeterinarios: [],
      },
      { ...EU, papel: 'FARMACIA', crmv: null },
    );
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');

    expect(await screen.findByText('Fila da farmácia')).toBeInTheDocument();
    expect(screen.getByText('Em análise').parentElement).toHaveTextContent('4');
    expect(screen.getByText('Em produção').parentElement).toHaveTextContent('1');
    // O degrau zerado continua na tela: sumir faria a fila mudar de forma a
    // cada carga, e a pessoa perder a referência de onde olhar.
    expect(screen.getByText('Pronto').parentElement).toHaveTextContent('0');
  });

  /**
   * Lista vazia e nulo querem dizer coisas diferentes: "não há nenhum" e "não
   * é para você". O bloco aparece no primeiro caso, com o texto de vazio.
   */
  it('lista vazia mostra o bloco com o vazio explicado; nulo esconde o bloco', async () => {
    const { fetchFalso } = apiFalsa(
      { fila: [], topVeterinarios: [] },
      { ...EU, papel: 'ADMIN', crmv: null },
    );
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');

    expect(await screen.findByText('Quem mais prescreveu no mês')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma receita emitida neste mês.')).toBeInTheDocument();
  });

  it('ranqueia na ordem que a API mandou', async () => {
    const { fetchFalso } = apiFalsa(
      {
        topVeterinarios: [
          { id: 'v-1', nome: 'Renata Mattos', crmv: 'SP 28.114', receitas: 9 },
          { id: 'v-2', nome: 'Caio Brandão', crmv: null, receitas: 2 },
        ],
      },
      { ...EU, papel: 'ADMIN', crmv: null },
    );
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByText('Quem mais prescreveu no mês');

    const nomes = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    const primeiro = nomes.findIndex((t) => t.includes('Renata Mattos'));
    const segundo = nomes.findIndex((t) => t.includes('Caio Brandão'));

    expect(primeiro).toBeLessThan(segundo);
    expect(screen.getByText('9 receitas')).toBeInTheDocument();
    expect(screen.getByText('2 receitas')).toBeInTheDocument();
  });
});

describe('últimas receitas', () => {
  const UMA = {
    id: 'ffffffff-3a4a-4a62-9d45-9c1f4a1d2b33',
    numero: 41,
    pacienteNome: 'Amora',
    tutorNome: 'Joana Prado',
    estado: 'EMITIDA',
    criadaEm: '2026-09-10T10:00:00.000Z',
  };

  it('mostra paciente, tutor e situação', async () => {
    const { fetchFalso } = apiFalsa({ ultimas: [UMA] });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');

    expect(await screen.findByText('Amora')).toBeInTheDocument();
    expect(screen.getByText('Joana Prado')).toBeInTheDocument();
    expect(screen.getByText('emitida')).toBeInTheDocument();
    expect(screen.getByText('nº 41')).toBeInTheDocument();
  });

  it('cada uma leva à receita', async () => {
    const { fetchFalso } = apiFalsa({ ultimas: [UMA] });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    const linha = await screen.findByRole('link', { name: /Amora/ });

    expect(linha).toHaveAttribute('href', `/receitas/${UMA.id}`);
  });

  it('rascunho aparece sem número, e não com um inventado', async () => {
    const { fetchFalso } = apiFalsa({
      ultimas: [{ ...UMA, numero: null, estado: 'RASCUNHO' }],
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByText('Amora');

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('rascunho')).toBeInTheDocument();
  });

  it('sem nenhuma, aponta o veterinário para onde começar', async () => {
    const { fetchFalso } = apiFalsa({ ultimas: [] });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: /Olá, Renata/ });

    expect(screen.getByText(/Comece por “Nova receita”/)).toBeInTheDocument();
  });

  it('e não convida quem não prescreve', async () => {
    const { fetchFalso } = apiFalsa({ ultimas: [] }, { ...EU, papel: 'FARMACIA', crmv: null });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: /Olá, Renata/ });

    expect(screen.queryByText(/Comece por “Nova receita”/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova receita' })).not.toBeInTheDocument();
  });
});
