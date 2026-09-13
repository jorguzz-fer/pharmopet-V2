import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from './ProvedorDeSessao';

type Fetch = typeof globalThis.fetch;

const USUARIO = {
  id: '3f6a1f4e-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Renata Mattos',
  email: 'renata@clinica.test',
  papel: 'VETERINARIO',
  crmv: 'SP 28.114',
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const semConteudo = () => new Response(null, { status: 204 });
const semSessao = () => json({ message: 'Sessão ausente ou expirada.' }, 401);

/**
 * Resposta conforme a rota chamada.
 *
 * A tela inicial lista receitas, então "estar logado" não é mais uma chamada
 * só: devolver o usuário para toda URL faria a lista receber um corpo sem
 * `receitas` e quebrar dentro do componente, escondendo o que o teste queria
 * verificar.
 */
function comoAApi(entrada: RequestInfo | URL): Response {
  const url = String(entrada instanceof Request ? entrada.url : entrada);

  if (url.includes('/receituario/receitas')) return json({ receitas: [] });
  return json(USUARIO);
}

/** Sobe a aplicação de verdade — rotas, provedor e telas — numa rota dada. */
function montar(caminho = '/') {
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

describe('porta das rotas internas', () => {
  it('manda para o login quem não tem sessão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<Fetch>(async () => semSessao()),
    );

    montar('/');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  /**
   * O estado "verificando" existe porque o cookie é httpOnly: só a API sabe se
   * há sessão. Tratá-lo como "fora" mandaria a pessoa para o login a cada F5,
   * mesmo logada — e é o erro fácil de cometer aqui.
   */
  it('não chuta que está fora enquanto a resposta não chega', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<Fetch>(() => new Promise<Response>(() => {})),
    );

    montar('/');

    expect(await screen.findByRole('status')).toHaveTextContent('Verificando sua sessão');
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('mostra a tela interna para quem tem sessão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<Fetch>(async (entrada) => comoAApi(entrada)),
    );

    montar('/');

    expect(await screen.findByRole('heading', { name: 'Receitas' })).toBeInTheDocument();
  });
});

describe('entrada', () => {
  it('entra e mostra quem entrou, com o papel', async () => {
    const fetchFalso = vi
      .fn<Fetch>()
      // A primeira pergunta, ao montar: ainda não há sessão.
      .mockResolvedValueOnce(semSessao())
      // O POST de entrada.
      .mockResolvedValueOnce(semConteudo())
      // A releitura depois de entrar.
      .mockResolvedValue(json(USUARIO));
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByRole('heading', { name: 'Entrar' });

    await userEvent.type(screen.getByLabelText('E-mail'), 'renata@clinica.test');
    await userEvent.type(screen.getByLabelText('Senha'), 'uma senha bem longa');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Renata Mattos')).toBeInTheDocument();
    expect(screen.getByText('Veterinário')).toBeInTheDocument();
  });

  /**
   * Quem depende de leitor de tela precisa ouvir a recusa. Sem `role="alert"`, o
   * formulário apenas volta ao normal e a pessoa tenta de novo sem saber o quê.
   */
  it('anuncia a recusa em vez de só voltar ao normal', async () => {
    const fetchFalso = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(semSessao())
      .mockResolvedValue(json({ message: 'E-mail ou senha incorretos.' }, 401));
    vi.stubGlobal('fetch', fetchFalso);

    montar('/entrar');

    await userEvent.type(screen.getByLabelText('E-mail'), 'renata@clinica.test');
    await userEvent.type(screen.getByLabelText('Senha'), 'chute');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
  });

  it('explica o 429 em vez de dizer que a senha está errada', async () => {
    const fetchFalso = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(semSessao())
      .mockResolvedValue(json({ message: 'Too Many Requests' }, 429));
    vi.stubGlobal('fetch', fetchFalso);

    montar('/entrar');

    await userEvent.type(screen.getByLabelText('E-mail'), 'renata@clinica.test');
    await userEvent.type(screen.getByLabelText('Senha'), 'uma senha bem longa');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
  });

  /** Senha na tela depois de uma recusa é leitura fácil por cima do ombro. */
  it('limpa a senha depois de uma recusa, e mantém o e-mail', async () => {
    const fetchFalso = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(semSessao())
      .mockResolvedValue(json({ message: 'E-mail ou senha incorretos.' }, 401));
    vi.stubGlobal('fetch', fetchFalso);

    montar('/entrar');

    await userEvent.type(screen.getByLabelText('E-mail'), 'renata@clinica.test');
    await userEvent.type(screen.getByLabelText('Senha'), 'chute');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('alert');

    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.getByLabelText('E-mail')).toHaveValue('renata@clinica.test');
  });
});

describe('saída', () => {
  it('volta para o login ao sair', async () => {
    const fetchFalso = vi
      .fn<Fetch>()
      .mockImplementationOnce(async (entrada) => comoAApi(entrada))
      .mockImplementation(async (entrada) =>
        String(entrada).includes('/receituario/') ? comoAApi(entrada) : semConteudo(),
      );
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByText('Renata Mattos');

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  /**
   * Se a chamada de saída falhar — cookie já expirado, rede caída — manter a
   * pessoa numa sessão morta é pior do que deslogar assim mesmo.
   */
  it('desloga mesmo quando a chamada de saída falha', async () => {
    const fetchFalso = vi
      .fn<Fetch>()
      .mockImplementationOnce(async (entrada) => comoAApi(entrada))
      .mockImplementation(async (entrada) => {
        if (String(entrada).includes('/receituario/')) return comoAApi(entrada);
        throw new TypeError('Failed to fetch');
      });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/');
    await screen.findByText('Renata Mattos');

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
});
