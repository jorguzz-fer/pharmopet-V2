import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

/**
 * As telas de senha.
 *
 * O que estes testes guardam, em ordem de gravidade: que a tela de pedido
 * **não diz se a conta existe** — a API responde igual nos dois casos, e um
 * texto na tela que dissesse "não encontramos esse e-mail" desfaria a proteção
 * inteira; que o link vencido é reconhecido **antes** de a pessoa escolher uma
 * senha; e que o campo de senha nasce escondido e o olho mostra.
 */

type Fetch = typeof globalThis.fetch;

function vazia(status = 204): Response {
  return new Response(null, { status });
}

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * API falsa que responde por rota.
 *
 * `respostas` mapeia um pedaço da URL para a resposta; o que não casar cai no
 * 404 da própria API, que é o desfecho de link inválido.
 */
function apiFalsa(respostas: { casa: string; responde: () => Response }[]) {
  const enviados: { url: string; metodo: string; corpo: Record<string, unknown> }[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada, init) => {
    const pedido = entrada instanceof Request ? entrada : null;
    const url = String(pedido ? pedido.url : entrada);
    const metodo = pedido?.method ?? init?.method ?? 'GET';

    if (metodo !== 'GET') {
      const texto = pedido ? await pedido.clone().text() : String(init?.body ?? '');
      enviados.push({ url, metodo, corpo: texto ? JSON.parse(texto) : {} });
    }

    const achada = respostas.find((r) => url.includes(r.casa));
    return achada ? achada.responde() : json({ message: 'não achei' }, 404);
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

describe('esqueci minha senha', () => {
  it('manda o e-mail digitado e confirma sem afirmar que a conta existe', async () => {
    const { fetchFalso, enviados } = apiFalsa([
      { casa: '/auth/senha/esqueci', responde: () => vazia() },
    ]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/esqueci-senha');
    await userEvent.type(screen.getByLabelText('E-mail'), 'renata@clinica.test');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar o link' }));

    expect(await screen.findByText(/Se houver uma conta/i)).toBeInTheDocument();
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.corpo).toEqual({ email: 'renata@clinica.test' });
  });

  /**
   * O ponto do módulo inteiro. Se algum dia alguém "melhorar" a tela para
   * dizer que o endereço não está cadastrado, este teste cai — e é para cair:
   * aqui o e-mail do veterinário é o identificador, e uma tela que confirma
   * quais endereços existem entrega a carteira de clientes da farmácia.
   */
  it('diz a mesma coisa para conta que não existe', async () => {
    // A API responde 204 também para quem não tem cadastro; a tela não tem
    // como distinguir, e é isso que precisa continuar verdade.
    const { fetchFalso } = apiFalsa([{ casa: '/auth/senha/esqueci', responde: () => vazia() }]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/esqueci-senha');
    await userEvent.type(screen.getByLabelText('E-mail'), 'ninguem@lugar.test');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar o link' }));

    const confirmacao = await screen.findByText(/Se houver uma conta/i);

    expect(confirmacao).toBeInTheDocument();
    expect(screen.queryByText(/não encontramos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/não existe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/não está cadastrad/i)).not.toBeInTheDocument();
  });

  it('explica a instalação sem e-mail configurado em vez de fingir que enviou', async () => {
    const { fetchFalso } = apiFalsa([
      { casa: '/auth/senha/esqueci', responde: () => json({ message: 'sem e-mail' }, 503) },
    ]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/esqueci-senha');
    await userEvent.type(screen.getByLabelText('E-mail'), 'renata@clinica.test');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar o link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não está configurada/i);
    expect(screen.queryByText(/Se houver uma conta/i)).not.toBeInTheDocument();
  });
});

describe('redefinir senha', () => {
  const LINK_VALE = { casa: '/auth/senha/redefinir/', responde: () => vazia() };

  it('recusa o link vencido antes de pedir uma senha nova', async () => {
    const { fetchFalso } = apiFalsa([
      { casa: '/auth/senha/redefinir/', responde: () => json({ message: 'venceu' }, 404) },
    ]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/redefinir-senha?token=vencido');

    // O que importa é a ordem: quem chega com link morto descobre agora, e não
    // depois de escolher e digitar uma senha duas vezes.
    expect(await screen.findByText(/expirou ou já foi usado/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Senha nova')).not.toBeInTheDocument();
  });

  it('recusa a URL sem token nenhum, sem chamar a API', async () => {
    const { fetchFalso } = apiFalsa([LINK_VALE]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/redefinir-senha');

    expect(await screen.findByText(/expirou ou já foi usado/i)).toBeInTheDocument();
    // Não se conta chamada nenhuma: o provedor de sessão faz a dele. O que não
    // pode existir é uma ida ao servidor para conferir um token vazio.
    const conferencias = fetchFalso.mock.calls.filter(([entrada]) =>
      String(entrada instanceof Request ? entrada.url : entrada).includes('/auth/senha/'),
    );
    expect(conferencias).toEqual([]);
  });

  it('troca a senha e manda o token do link junto', async () => {
    const { fetchFalso, enviados } = apiFalsa([
      LINK_VALE,
      { casa: '/auth/senha/redefinir', responde: () => vazia() },
    ]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/redefinir-senha?token=abc123');
    const campo = await screen.findByLabelText('Senha nova');
    await userEvent.type(campo, 'uma senha bem longa');
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'uma senha bem longa');
    await userEvent.click(screen.getByRole('button', { name: 'Trocar a senha' }));

    expect(await screen.findByText(/Entre com a senha nova/i)).toBeInTheDocument();
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.corpo).toEqual({ token: 'abc123', senhaNova: 'uma senha bem longa' });
  });

  /**
   * Quem redefine costuma estar redefinindo porque desconfia que alguém mais
   * entrou — e quem só esqueceu a senha precisa entender por que o celular
   * pediu login de novo. A frase não é enfeite.
   */
  it('avisa que as outras sessões caíram', async () => {
    const { fetchFalso } = apiFalsa([
      LINK_VALE,
      { casa: '/auth/senha/redefinir', responde: () => vazia() },
    ]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/redefinir-senha?token=abc123');
    await userEvent.type(await screen.findByLabelText('Senha nova'), 'uma senha bem longa');
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'uma senha bem longa');
    await userEvent.click(screen.getByRole('button', { name: 'Trocar a senha' }));

    expect(await screen.findByText(/sessões abertas em outros aparelhos/i)).toBeInTheDocument();
  });

  it('não envia quando as duas senhas diferem', async () => {
    const { fetchFalso, enviados } = apiFalsa([
      LINK_VALE,
      { casa: '/auth/senha/redefinir', responde: () => vazia() },
    ]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/redefinir-senha?token=abc123');
    await userEvent.type(await screen.findByLabelText('Senha nova'), 'uma senha bem longa');
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'outra senha bem longa');
    await userEvent.click(screen.getByRole('button', { name: 'Trocar a senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não são iguais/i);
    expect(enviados).toEqual([]);
  });

  it('não envia senha curta demais', async () => {
    const { fetchFalso, enviados } = apiFalsa([
      LINK_VALE,
      { casa: '/auth/senha/redefinir', responde: () => vazia() },
    ]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/redefinir-senha?token=abc123');
    await userEvent.type(await screen.findByLabelText('Senha nova'), 'curta');
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'curta');
    await userEvent.click(screen.getByRole('button', { name: 'Trocar a senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/pelo menos 12/i);
    expect(enviados).toEqual([]);
  });

  /**
   * O link pode morrer entre a conferência e o envio — outro pedido feito no
   * meio, ou a hora virando. A tela precisa sair do formulário, e não deixar a
   * pessoa tentando de novo sobre um link que não existe mais.
   */
  it('volta para "link inválido" se o token morrer no envio', async () => {
    let conferido = false;
    const { fetchFalso } = apiFalsa([
      {
        casa: '/auth/senha/redefinir',
        responde: () => {
          if (!conferido) {
            conferido = true;
            return vazia();
          }
          return json({ message: 'expirou' }, 404);
        },
      },
    ]);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/redefinir-senha?token=abc123');
    await userEvent.type(await screen.findByLabelText('Senha nova'), 'uma senha bem longa');
    await userEvent.type(screen.getByLabelText('Repita a senha nova'), 'uma senha bem longa');
    await userEvent.click(screen.getByRole('button', { name: 'Trocar a senha' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Senha nova')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/expirou ou já foi usado/i)).toBeInTheDocument();
  });

  describe('o olho da senha', () => {
    it('nasce escondendo, e mostra quando clicado', async () => {
      const { fetchFalso } = apiFalsa([LINK_VALE]);
      vi.stubGlobal('fetch', fetchFalso);

      montar('/redefinir-senha?token=abc123');
      const campo = await screen.findByLabelText('Senha nova');

      // Escondido por padrão: quem só quer trocar a senha rápido não deve
      // tê-la exposta a quem estiver do outro lado do balcão.
      expect(campo).toHaveAttribute('type', 'password');

      await userEvent.click(screen.getAllByRole('button', { name: 'Mostrar senha' })[0]!);
      expect(campo).toHaveAttribute('type', 'text');

      await userEvent.click(screen.getAllByRole('button', { name: 'Ocultar senha' })[0]!);
      expect(campo).toHaveAttribute('type', 'password');
    });

    /**
     * Um olho por campo, cada um no seu. Um botão que revelasse os dois
     * derrotaria a conferência: a segunda digitação existe para pegar o erro
     * que os olhos não pegam.
     */
    it('vale por campo, e não pelos dois de uma vez', async () => {
      const { fetchFalso } = apiFalsa([LINK_VALE]);
      vi.stubGlobal('fetch', fetchFalso);

      montar('/redefinir-senha?token=abc123');
      const nova = await screen.findByLabelText('Senha nova');
      const repetida = screen.getByLabelText('Repita a senha nova');

      await userEvent.click(screen.getAllByRole('button', { name: 'Mostrar senha' })[0]!);

      expect(nova).toHaveAttribute('type', 'text');
      expect(repetida).toHaveAttribute('type', 'password');
    });

    /**
     * O olho vive dentro de um `form`, onde o padrão de um botão é `submit`.
     * Sem `type="button"`, clicar para conferir a senha tentaria trocá-la.
     */
    it('não envia o formulário ao ser clicado', async () => {
      const { fetchFalso, enviados } = apiFalsa([
        LINK_VALE,
        { casa: '/auth/senha/redefinir', responde: () => vazia() },
      ]);
      vi.stubGlobal('fetch', fetchFalso);

      montar('/redefinir-senha?token=abc123');
      await userEvent.type(await screen.findByLabelText('Senha nova'), 'uma senha bem longa');
      await userEvent.click(screen.getAllByRole('button', { name: 'Mostrar senha' })[0]!);

      expect(enviados).toEqual([]);
      expect(screen.getByLabelText('Senha nova')).toBeInTheDocument();
    });
  });
});
