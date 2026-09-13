import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

/**
 * A tela de equipe.
 *
 * O que estes testes guardam: que a senha sorteada apareça uma vez e não seja
 * escolhida por ninguém, que a tela não ofereça desligar a própria conta, e que
 * "bloqueado" e "desativado" não sejam ditos como se fossem a mesma coisa.
 */

type Fetch = typeof globalThis.fetch;

const EU = {
  id: 'aa11f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Marcos Pharmo',
  email: 'marcos@pharmopet.test',
  papel: 'ADMIN',
  crmv: null,
};

function usuario(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: 'bb22f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
    nome: 'Renata Mattos',
    email: 'renata@clinica.test',
    papel: 'VETERINARIO',
    crmv: 'SP 28.114',
    bloqueado: false,
    desativado: false,
    criadoEm: '2026-09-01T10:00:00.000Z',
    ...sobrescreve,
  };
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function apiFalsa(usuarios: unknown[]) {
  const enviados: { url: string; metodo: string; corpo: Record<string, unknown> }[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada, init) => {
    const pedido = entrada instanceof Request ? entrada : null;
    const url = String(pedido ? pedido.url : entrada);
    const metodo = pedido?.method ?? init?.method ?? 'GET';

    if (metodo !== 'GET') {
      const texto = pedido ? await pedido.clone().text() : String(init?.body ?? '');
      enviados.push({ url, metodo, corpo: texto ? JSON.parse(texto) : {} });
      return json(EU, 200);
    }

    if (url.includes('/auth/usuarios')) return json({ usuarios });
    if (url.includes('/auth/eu')) return json(EU);
    return json({});
  });

  return { fetchFalso, enviados };
}

function montar() {
  const router = createMemoryRouter(rotas, { initialEntries: ['/equipe'] });
  return render(
    <ProvedorDeSessao>
      <RouterProvider router={router} />
    </ProvedorDeSessao>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('equipe', () => {
  it('lista quem tem conta, com papel e CRMV', async () => {
    const { fetchFalso } = apiFalsa([usuario()]);
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    expect(await screen.findByText('Renata Mattos')).toBeInTheDocument();
    expect(screen.getByText('Veterinário')).toBeInTheDocument();
    expect(screen.getByText('SP 28.114')).toBeInTheDocument();
  });

  /**
   * Bloqueio é temporário e automático, por senha errada demais; desativado é
   * decisão de alguém e não vence sozinho. Dizer os dois igual faria a farmácia
   * esperar passar o que não passa.
   */
  it('separa bloqueado por tentativas de desativado', async () => {
    const { fetchFalso } = apiFalsa([
      usuario({ id: 'b-1', nome: 'Bloqueada', bloqueado: true }),
      usuario({ id: 'd-1', nome: 'Desligado', desativado: true }),
    ]);
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    expect(await screen.findByText('bloqueado por tentativas')).toBeInTheDocument();
    expect(screen.getByText('desativado')).toBeInTheDocument();
  });

  it('mostra quem foi desativado, em vez de escondê-lo da lista', async () => {
    const { fetchFalso } = apiFalsa([usuario({ nome: 'Demitido', desativado: true })]);
    vi.stubGlobal('fetch', fetchFalso);

    montar();

    expect(await screen.findByText('Demitido')).toBeInTheDocument();
  });

  /**
   * Desligar a própria conta derruba a sessão na hora, e o conserto passa a
   * exigir o comando no servidor. A API recusa com 409; a tela nem oferece.
   */
  it('não oferece desativar a própria conta', async () => {
    const { fetchFalso } = apiFalsa([usuario({ id: EU.id, nome: EU.nome, papel: 'ADMIN' })]);
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Marcos Pharmo/ }));

    expect(await screen.findByLabelText('Nome')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument();
  });

  it('oferece desativar quem não é você', async () => {
    const { fetchFalso, enviados } = apiFalsa([usuario()]);
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Renata Mattos/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.metodo).toBe('PATCH');
    expect(enviados[0]?.corpo).toMatchObject({ desativado: true });
  });

  it('oferece reativar quem está desativado', async () => {
    const { fetchFalso, enviados } = apiFalsa([usuario({ desativado: true })]);
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Renata Mattos/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reativar' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.corpo).toMatchObject({ desativado: false });
  });

  /** CRMV é de quem assina receita; nos outros papéis o campo nem aparece. */
  it('só pede CRMV de veterinário, e o limpa ao trocar de papel', async () => {
    const { fetchFalso, enviados } = apiFalsa([usuario()]);
    vi.stubGlobal('fetch', fetchFalso);

    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Renata Mattos/ }));
    expect(await screen.findByLabelText('CRMV')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/Farmácia/));
    expect(screen.queryByLabelText('CRMV')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.corpo).toMatchObject({ papel: 'FARMACIA', crmv: null });
  });

  describe('nova pessoa', () => {
    it('sorteia a senha em vez de deixar o administrador escolher', async () => {
      const { fetchFalso, enviados } = apiFalsa([]);
      vi.stubGlobal('fetch', fetchFalso);

      montar();
      await userEvent.click(await screen.findByRole('button', { name: 'Nova pessoa' }));

      // Não existe campo de senha: quem cria não escolhe a senha de quem entra.
      expect(screen.queryByLabelText(/Senha/)).not.toBeInTheDocument();

      await userEvent.type(screen.getByLabelText('Nome'), 'Bruno Lima');
      await userEvent.type(screen.getByLabelText('E-mail'), 'bruno@clinica.test');
      await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

      await waitFor(() => expect(enviados).toHaveLength(1));
      const senha = enviados[0]?.corpo.senha;
      expect(typeof senha).toBe('string');
      // A API exige doze; sortear vinte deixa margem de sobra.
      expect(String(senha).length).toBeGreaterThanOrEqual(20);
    });

    it('mostra a senha uma vez, avisando que é a única', async () => {
      const { fetchFalso, enviados } = apiFalsa([]);
      vi.stubGlobal('fetch', fetchFalso);

      montar();
      await userEvent.click(await screen.findByRole('button', { name: 'Nova pessoa' }));
      await userEvent.type(screen.getByLabelText('Nome'), 'Bruno Lima');
      await userEvent.type(screen.getByLabelText('E-mail'), 'bruno@clinica.test');
      await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

      expect(await screen.findByText(/uma vez só/)).toBeInTheDocument();
      // A mesma senha que foi enviada, e não outra inventada para a tela.
      expect(screen.getByText(String(enviados[0]?.corpo.senha))).toBeInTheDocument();
    });

    it('manda o e-mail em minúsculas, como a API o guarda', async () => {
      const { fetchFalso, enviados } = apiFalsa([]);
      vi.stubGlobal('fetch', fetchFalso);

      montar();
      await userEvent.click(await screen.findByRole('button', { name: 'Nova pessoa' }));
      await userEvent.type(screen.getByLabelText('Nome'), 'Bruno Lima');
      await userEvent.type(screen.getByLabelText('E-mail'), 'Bruno@Clinica.TEST');
      await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

      await waitFor(() => expect(enviados).toHaveLength(1));
      expect(enviados[0]?.corpo).toMatchObject({ email: 'bruno@clinica.test' });
    });
  });
});
