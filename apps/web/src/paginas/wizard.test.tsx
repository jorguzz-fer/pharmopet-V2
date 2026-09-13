import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

/**
 * O wizard de receita.
 *
 * O que estes testes guardam: que dá para começar uma receita **sem já ter um
 * paciente na mão** — antes, `/receitas/nova` sem `?paciente` era um beco sem
 * saída, e o único caminho era achar o tutor, abrir a ficha e clicar em
 * "Prescrever"; que o passo escolhido fica na URL, para recarregar e voltar
 * funcionarem; e que quem não pode prescrever não é convidado a.
 */

type Fetch = typeof globalThis.fetch;

/** `crmv` anulável porque a farmácia não tem um, e ela entra num dos testes. */
const EU: {
  id: string;
  nome: string;
  email: string;
  papel: string;
  crmv: string | null;
} = {
  id: 'aa11f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Renata Mattos',
  email: 'renata@clinica.test',
  papel: 'VETERINARIO',
  crmv: 'SP 28.114',
};

const TUTOR = {
  id: 't-1',
  nome: 'Joana Prado',
  cpf: '123.456.789-09',
  telefone: '(11) 90000-0000',
  email: null,
  quantidadeDePacientes: 1,
  criadoEm: '2026-09-01T10:00:00.000Z',
};

const PACIENTE = {
  id: 'p-1',
  tutorId: 't-1',
  nome: 'Amora',
  especie: 'CANINO',
  raca: 'SRD',
  pesoEmGramas: 12500,
  obito: false,
  criadoEm: '2026-09-01T10:00:00.000Z',
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * API falsa.
 *
 * `pacientes` é uma função para os testes poderem devolver uma lista vazia no
 * primeiro momento e outra depois de um cadastro.
 */
function apiFalsa({
  tutores = [TUTOR],
  pacientes = () => [PACIENTE],
  eu = EU,
}: {
  tutores?: unknown[];
  pacientes?: () => unknown[];
  eu?: typeof EU;
} = {}) {
  const enviados: { url: string; metodo: string; corpo: Record<string, unknown> }[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada, init) => {
    const pedido = entrada instanceof Request ? entrada : null;
    const url = String(pedido ? pedido.url : entrada);
    const metodo = pedido?.method ?? init?.method ?? 'GET';

    if (metodo === 'POST') {
      const texto = pedido ? await pedido.clone().text() : String(init?.body ?? '');
      const corpo = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
      enviados.push({ url, metodo, corpo });

      if (url.includes('/receituario/tutores')) {
        return json({ ...TUTOR, id: 't-novo', nome: corpo.nome }, 201);
      }
      if (url.includes('/receituario/pacientes')) {
        return json({ ...PACIENTE, id: 'p-novo', nome: corpo.nome }, 201);
      }
      return json({}, 201);
    }

    if (url.includes('/auth/eu')) return json(eu);
    // O id vem antes da lista: `/pacientes/p-1` casaria com `/pacientes`.
    if (url.includes('/receituario/pacientes/')) return json(PACIENTE);
    if (url.includes('/receituario/tutores/')) return json(TUTOR);
    if (url.includes('/receituario/tutores')) return json({ tutores });
    if (url.includes('/receituario/pacientes')) return json({ pacientes: pacientes() });
    if (url.includes('/receituario/receitas')) return json({ receitas: [] });
    if (url.includes('/catalogo/formas')) {
      return json({ formas: [{ id: 'f-1', nome: 'CÁPSULAS', aceitaAroma: false }] });
    }
    if (url.includes('/clinicas')) return json({ clinicas: [] });
    return json({});
  });

  return { fetchFalso, enviados };
}

function montar(caminho: string) {
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

describe('entrar no wizard', () => {
  it('a lista de receitas oferece começar uma', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas');

    const link = await screen.findByRole('link', { name: 'Nova receita' });

    // Link de verdade, e não um `<button>` dentro de um `<a>`: quem usa leitor
    // de tela precisa ouvir que isto muda de página.
    expect(link).toHaveAttribute('href', '/receitas/nova');
  });

  /**
   * O beco sem saída que motivou tudo isto: `/receitas/nova` sem `?paciente`
   * respondia "escolha um paciente na ficha do tutor" e parava ali.
   */
  it('abre no passo do tutor quando não veio paciente nenhum na URL', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/nova');

    expect(await screen.findByText('De quem é o paciente?')).toBeInTheDocument();
    expect(screen.queryByText(/Escolha um paciente na ficha do tutor/)).not.toBeInTheDocument();
  });
});

describe('os quatro passos', () => {
  it('mostra a trilha e marca onde estamos', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/nova');
    await screen.findByText('De quem é o paciente?');

    const trilha = screen.getByRole('list', { name: 'Passos da receita' });

    expect(trilha).toHaveTextContent('Tutor');
    expect(trilha).toHaveTextContent('Paciente');
    expect(trilha).toHaveTextContent('Prescrição');
    // O quarto passo aparece apagado, mas aparece: saber que ainda vem uma
    // conferência muda o que a pessoa faz agora.
    expect(trilha).toHaveTextContent('Revisão');
  });

  it('anuncia o passo atual a quem usa leitor de tela', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/nova');
    await screen.findByText('De quem é o paciente?');

    const atual = document.querySelector('[aria-current="step"]');

    expect(atual).not.toBeNull();
    expect(atual).toHaveTextContent('Tutor');
  });

  it('escolher o tutor leva ao passo do paciente, e o guarda na URL', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    const router = montar('/receitas/nova');
    await userEvent.click(await screen.findByRole('button', { name: /Joana Prado/ }));

    expect(await screen.findByText('Paciente de Joana Prado')).toBeInTheDocument();
    // Na URL, e não só na memória: é o que faz recarregar e voltar
    // funcionarem. A v1 guardava em store e perdia tudo num F5.
    expect(router.state.location.search).toBe('?tutor=t-1');
  });

  it('escolher o paciente leva à prescrição, e o guarda na URL', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    const router = montar('/receitas/nova?tutor=t-1');
    await userEvent.click(await screen.findByRole('button', { name: /Amora/ }));

    expect(await screen.findByRole('button', { name: 'Salvar rascunho' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?paciente=p-1');
  });

  /** Abrir direto em `?tutor=` tem que reabrir o passo 2 inteiro, com o nome. */
  it('recarregar no meio do caminho volta ao mesmo passo', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/nova?tutor=t-1');

    expect(await screen.findByText('Paciente de Joana Prado')).toBeInTheDocument();
  });

  /**
   * O atalho antigo continua valendo: a ficha do tutor manda `?paciente=`
   * direto, e isso tem que cair no passo 3 sem passar pelos dois primeiros.
   */
  it('o link da ficha do tutor ainda cai direto na prescrição', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/nova?paciente=p-1');

    expect(await screen.findByRole('button', { name: 'Salvar rascunho' })).toBeInTheDocument();
    expect(screen.queryByText('De quem é o paciente?')).not.toBeInTheDocument();
  });
});

describe('voltar', () => {
  it('trocar o paciente volta ao passo 2 mantendo o tutor', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    const router = montar('/receitas/nova?paciente=p-1');
    await userEvent.click(await screen.findByRole('button', { name: /Trocar o paciente/ }));

    // Mantém o tutor: quem errou o bicho quase sempre errou dentro da mesma
    // ficha, e limpar os dois faria refazer a busca do tutor sem motivo.
    expect(router.state.location.search).toBe('?tutor=t-1');
    expect(await screen.findByText('Paciente de Joana Prado')).toBeInTheDocument();
  });

  it('trocar o tutor volta ao passo 1 e limpa tudo', async () => {
    const { fetchFalso } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    const router = montar('/receitas/nova?tutor=t-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Trocar tutor' }));

    expect(router.state.location.search).toBe('');
    expect(await screen.findByText('De quem é o paciente?')).toBeInTheDocument();
  });
});

describe('cadastrar sem sair do meio da receita', () => {
  it('cadastra o tutor e já avança para o paciente dele', async () => {
    const { fetchFalso, enviados } = apiFalsa({ tutores: [] });
    vi.stubGlobal('fetch', fetchFalso);

    const router = montar('/receitas/nova');
    await userEvent.click(await screen.findByRole('button', { name: 'Novo tutor' }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Carlos Lima');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar e continuar' }));

    await waitFor(() => expect(router.state.location.search).toBe('?tutor=t-novo'));
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.corpo).toMatchObject({ nome: 'Carlos Lima' });
  });

  /**
   * Tutor sem paciente nenhum abre o formulário direto: uma lista vazia com um
   * botão "Novo paciente" seria um clique sobre uma escolha que não existe.
   */
  it('abre o formulário de paciente quando o tutor não tem nenhum', async () => {
    const { fetchFalso } = apiFalsa({ pacientes: () => [] });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/nova?tutor=t-1');

    expect(await screen.findByText(/ainda não tem paciente cadastrado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Espécie')).toBeInTheDocument();
  });

  it('cadastra o paciente e já avança para a prescrição', async () => {
    const { fetchFalso, enviados } = apiFalsa({ pacientes: () => [] });
    vi.stubGlobal('fetch', fetchFalso);

    const router = montar('/receitas/nova?tutor=t-1');
    await userEvent.type(await screen.findByLabelText('Nome'), 'Bidu');
    await userEvent.type(screen.getByLabelText('Peso (kg)'), '8,2');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar e continuar' }));

    await waitFor(() => expect(router.state.location.search).toBe('?paciente=p-novo'));
    // O peso vai em gramas: a tela pergunta em quilo porque é assim que a
    // balança da clínica fala, e converte na borda.
    expect(enviados[0]!.corpo).toMatchObject({ tutorId: 't-1', nome: 'Bidu', pesoEmGramas: 8200 });
  });
});

describe('o que o passo 2 avisa antes de escolher', () => {
  it('marca o paciente sem peso, que a prescrição vai recusar', async () => {
    const { fetchFalso } = apiFalsa({
      pacientes: () => [{ ...PACIENTE, id: 'p-2', nome: 'Nino', pesoEmGramas: null }],
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/nova?tutor=t-1');

    // Dizer aqui evita escolher e levar um não na tela seguinte.
    expect(await screen.findByText('sem peso')).toBeInTheDocument();
  });
});

describe('quem não prescreve', () => {
  it('não vê o convite para abrir uma receita', async () => {
    const { fetchFalso } = apiFalsa({ eu: { ...EU, papel: 'FARMACIA', crmv: null } });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas');

    // A aba abre; o que não aparece é o botão. Quem chamar a rota direto leva
    // 403 da API — a tela só evita oferecer o que vai ser recusado.
    expect(await screen.findByRole('heading', { name: 'Receitas' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova receita' })).not.toBeInTheDocument();
  });
});
