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

/**
 * O token do link, no comprimento real e **de propósito sem aleatoriedade**.
 *
 * A varredura de segredos do CI barra string de alta entropia perto da palavra
 * "token", e está certa: é assim que uma chave de verdade vaza para o
 * repositório. Um valor repetido tem a mesma forma para o teste e não se
 * parece com segredo nenhum — trocá-lo por algo "mais realista" derruba o CI.
 */
const TOKEN = 'link-de-teste-link-de-teste-link-de-teste-li';

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function formulacao(sobre: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    formaId: 'fa1',
    forma: 'CÁPSULAS',
    frequenciaHoras: 8,
    dias: 10,
    quantidade: 30,
    orientacao: 'Dar junto da ração.',
    valorEmCentavos: 6840,
    itens: [
      {
        insumoId: 'i1',
        codigo: '665',
        descricao: 'Gabapentina',
        doseMg: 100,
        listaDeControle: 'C1',
      },
    ],
    avisos: [],
    impedimentos: [],
    ...sobre,
  };
}

function receita(sobre: Record<string, unknown> = {}) {
  return {
    id: 'rr77f4e0-0000-4000-8000-000000000001',
    numero: 7,
    estado: 'EMITIDA',
    situacao: 'valida',
    veterinarioId: VETERINARIO.id,
    veterinarioNome: 'Renata Mattos',
    crmv: 'SP 28.114',
    pacienteId: 'ee55f4e0-0000-4000-8000-000000000001',
    pacienteNome: 'Tobias',
    tutorNome: 'Marina Prado',
    clinicaId: null,
    clinicaNome: 'Vida Animal',
    clinicaCnpj: '11.222.333/0001-81',
    pesoDoPacienteEmGramas: 12_000,
    emitidaEm: '2026-09-13T12:00:00.000Z',
    validaAte: '2026-10-13T12:00:00.000Z',
    prazoEmDias: 30,
    prazoMotivo: 'Lista C1: 30 dias.',
    canceladaEm: null,
    motivoDoCancelamento: null,
    observacoes: null,
    tokenPublico: TOKEN,
    formulacoes: [formulacao()],
    valorTotalEmCentavos: 6840,
    criadaEm: '2026-09-13T11:00:00.000Z',
    ...sobre,
  };
}

function publica(sobre: Record<string, unknown> = {}) {
  return {
    numero: 7,
    situacao: 'valida',
    emitidaEm: '2026-09-13T12:00:00.000Z',
    validaAte: '2026-10-13T12:00:00.000Z',
    prazoMotivo: 'Lista C1: 30 dias.',
    motivoDoCancelamento: null,
    clinicaNome: 'Vida Animal',
    veterinarioNome: 'Renata Mattos',
    crmv: 'SP 28.114',
    tutorNome: 'Marina Prado',
    tutorCpf: '529.***.**7-25',
    pacienteNome: 'Tobias',
    pacienteEspecie: 'Canino',
    formulacoes: [
      {
        forma: 'CÁPSULAS',
        quantidade: 30,
        frequenciaHoras: 8,
        dias: 10,
        orientacao: 'Dar junto da ração.',
        valorEmCentavos: 6840,
        itens: [{ descricao: 'Gabapentina', doseMg: 100 }],
      },
    ],
    valorTotalEmCentavos: 6840,
    ...sobre,
  };
}

function apiFalsa(respostas: Record<string, unknown> = {}, eu: unknown = VETERINARIO) {
  const pedidos: string[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada) => {
    const pedido = entrada instanceof Request ? entrada : null;
    const url = String(pedido ? pedido.url : entrada);
    pedidos.push(url);

    for (const [trecho, resposta] of Object.entries(respostas)) {
      if (url.includes(trecho)) {
        return resposta === null ? json({ message: 'Não encontrada' }, 404) : json(resposta);
      }
    }

    // `eu: null` é quem não entrou — a API responde 401, e é assim que a
    // página pública precisa funcionar mesmo assim.
    if (url.includes('/auth/eu')) {
      return eu === null ? json({ message: 'Sem sessão' }, 401) : json(eu);
    }
    return json({}, 404);
  });

  return { fetchFalso, pedidos };
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

describe('entrega ao tutor, na tela da receita', () => {
  it('oferece o PDF e o link depois de emitida', async () => {
    const { fetchFalso } = apiFalsa({ '/receituario/receitas/': receita() });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/rr77f4e0-0000-4000-8000-000000000001');

    expect(await screen.findByText('Entregar ao tutor')).toBeInTheDocument();

    const pdf = screen.getByRole('link', { name: 'Abrir o PDF' });
    expect(pdf).toHaveAttribute(
      'href',
      expect.stringContaining('/receituario/receitas/rr77f4e0-0000-4000-8000-000000000001/pdf'),
    );

    // O link do tutor aponta para o app, não para a API: é uma página, não um
    // arquivo.
    const campo = screen.getByLabelText('Link do tutor');
    expect(campo).toHaveValue(`${window.location.origin}/r/${TOKEN}`);
  });

  it('não oferece nada disso num rascunho', async () => {
    const rascunho = receita({
      numero: null,
      estado: 'RASCUNHO',
      situacao: 'rascunho',
      emitidaEm: null,
      validaAte: null,
      prazoEmDias: null,
      prazoMotivo: null,
      // O ponto: sem emissão não há token, e sem token não há o que entregar.
      tokenPublico: null,
    });
    const { fetchFalso } = apiFalsa({ '/receituario/receitas/': rascunho });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/rr77f4e0-0000-4000-8000-000000000001');

    expect(await screen.findByText('Rascunho')).toBeInTheDocument();
    expect(screen.queryByText('Entregar ao tutor')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir o PDF' })).not.toBeInTheDocument();
  });

  it('copia o link para a área de transferência', async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: escrever } });

    const { fetchFalso } = apiFalsa({ '/receituario/receitas/': receita() });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/rr77f4e0-0000-4000-8000-000000000001');

    await userEvent.click(await screen.findByRole('button', { name: 'Copiar link' }));

    expect(escrever).toHaveBeenCalledWith(`${window.location.origin}/r/${TOKEN}`);
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });

  it('avisa quando copiar não funciona, em vez de não fazer nada', async () => {
    // `navigator.clipboard` não existe fora de HTTPS. Sem aviso, a pessoa
    // clicaria de novo achando que errou o clique.
    const escrever = vi.fn().mockRejectedValue(new Error('sem permissão'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: escrever } });

    const { fetchFalso } = apiFalsa({ '/receituario/receitas/': receita() });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/rr77f4e0-0000-4000-8000-000000000001');

    await userEvent.click(await screen.findByRole('button', { name: 'Copiar link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível copiar');
  });
});

describe('página que o tutor abre', () => {
  it('abre sem sessão nenhuma', async () => {
    const { fetchFalso, pedidos } = apiFalsa({ '/publico/receitas/': publica() }, null);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/r/${TOKEN}`);

    expect(await screen.findByText('Receita nº 7')).toBeInTheDocument();
    expect(screen.getByText(/Tobias/)).toBeInTheDocument();

    // O ponto da rota: não foi redirecionada para o login.
    expect(pedidos.some((u) => u.includes('/auth/entrar'))).toBe(false);
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
  });

  it('mostra o CPF só pelas pontas, como a API manda', async () => {
    const { fetchFalso } = apiFalsa({ '/publico/receitas/': publica() }, null);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/r/${TOKEN}`);

    expect(await screen.findByText(/529\.\*\*\*\.\*\*7-25/)).toBeInTheDocument();
  });

  it('traduz a frequência para o que o tutor faz', async () => {
    const { fetchFalso } = apiFalsa({ '/publico/receitas/': publica() }, null);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/r/${TOKEN}`);

    // "1 a cada 8 h" é linguagem de quem prescreve. Quem dá o remédio precisa
    // saber quantas vezes por dia.
    expect(await screen.findByText(/Dar 3 vezes ao dia, por 10 dias/)).toBeInTheDocument();
  });

  it('diz quando foi cancelada, em vez de sumir', async () => {
    const { fetchFalso } = apiFalsa(
      {
        '/publico/receitas/': publica({
          situacao: 'cancelada',
          motivoDoCancelamento: 'Dose revista depois da consulta.',
        }),
      },
      null,
    );
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/r/${TOKEN}`);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('Esta receita foi cancelada');
    expect(aviso).toHaveTextContent('Dose revista depois da consulta.');
  });

  it('avisa quando venceu', async () => {
    const { fetchFalso } = apiFalsa(
      { '/publico/receitas/': publica({ situacao: 'vencida' }) },
      null,
    );
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/r/${TOKEN}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('O prazo desta receita venceu');
  });

  it('explica o link quebrado em vez de mostrar erro técnico', async () => {
    const { fetchFalso } = apiFalsa({ '/publico/receitas/': null }, null);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/r/${TOKEN}`);

    expect(await screen.findByText('Não encontramos esta receita')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/copiado pela metade/)).toBeInTheDocument());
  });

  it('não mostra menu nem abas do sistema', async () => {
    const { fetchFalso } = apiFalsa({ '/publico/receitas/': publica() }, null);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/r/${TOKEN}`);

    await screen.findByText('Receita nº 7');

    // Quem abre isto veio de um link no WhatsApp. Oferecer "Clínicas" e
    // "Design system" só produziria cliques que levam ao login.
    expect(screen.queryByRole('link', { name: 'Receitas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Clínicas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sair/ })).not.toBeInTheDocument();
  });

  it('leva ao PDF pelo mesmo token', async () => {
    const { fetchFalso } = apiFalsa({ '/publico/receitas/': publica() }, null);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/r/${TOKEN}`);

    const pdf = await screen.findByRole('link', { name: 'Abrir a receita em PDF' });
    expect(pdf).toHaveAttribute('href', expect.stringContaining(`/publico/receitas/${TOKEN}/pdf`));
  });
});
