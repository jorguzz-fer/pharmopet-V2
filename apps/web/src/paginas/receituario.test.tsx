import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

type Fetch = typeof globalThis.fetch;

const VETERINARIO = {
  id: 'aa11f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Renata Mattos',
  email: 'renata@clinica.test',
  papel: 'VETERINARIO',
  crmv: 'SP 28.114',
};

const TUTOR = {
  id: 'bb22f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Marina Prado',
  cpf: '529.982.247-25',
  email: null,
  telefone: '(11) 98765-4321',
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  observacoes: null,
  quantidadeDePacientes: 1,
};

const PACIENTE = {
  id: 'cc33f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  tutorId: TUTOR.id,
  tutorNome: TUTOR.nome,
  nome: 'Tobias',
  especie: 'CANINO',
  raca: 'SRD',
  sexo: 'MACHO',
  castrado: false,
  pesoEmGramas: 12_000,
  pesoAferidoEm: '2026-09-01T10:00:00.000Z',
  nascimentoEm: null,
  observacoes: null,
  obito: false,
};

const INSUMO = {
  id: 'dd44f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  codigo: '665',
  descricao: 'Gabapentina',
  controlado: true,
  listaDeControle: 'C1',
  estoque: 'disponivel',
  formasProibidas: [],
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Um dublê da API que responde por rota, e guarda o que recebeu.
 *
 * Guardar o corpo enviado é o ponto de metade destes testes: o que importa
 * não é a tela mostrar "12,5 kg", é o número que sai dela para o servidor.
 */
function apiFalsa(respostas: Record<string, unknown> = {}) {
  const enviados: { url: string; corpo: unknown }[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada, init) => {
    // O openapi-fetch monta um `Request` e o passa como primeiro argumento, em
    // vez de usar `(url, init)`. Ler o método e o corpo só de `init` faria este
    // dublê não registrar chamada nenhuma — e o teste passaria vazio.
    const pedido = entrada instanceof Request ? entrada : null;
    const url = String(pedido ? pedido.url : entrada);
    const metodo = pedido?.method ?? init?.method ?? 'GET';

    if (metodo !== 'GET') {
      const texto = pedido ? await pedido.clone().text() : String(init?.body ?? '');
      enviados.push({ url, corpo: texto ? JSON.parse(texto) : undefined });
    }

    for (const [trecho, resposta] of Object.entries(respostas)) {
      if (url.includes(trecho)) return json(resposta);
    }

    if (url.includes('/auth/eu')) return json(VETERINARIO);
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

describe('cadastro de paciente', () => {
  /**
   * O erro que esta tela existe para impedir: o veterinário pensa em quilo, a
   * API fala em grama. Doze digitados e gravados como 12 gramas dariam uma dose
   * mil vezes menor, e o número continuaria parecendo plausível na tela.
   */
  it('envia o peso em gramas, e não o que foi digitado em quilos', async () => {
    const { fetchFalso, enviados } = apiFalsa({
      '/receituario/tutores/': TUTOR,
      '/receituario/pacientes': { pacientes: [] },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/tutores/${TUTOR.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Novo paciente' }));

    await userEvent.type(screen.getByLabelText('Nome'), 'Tobias');
    await userEvent.type(screen.getByLabelText('Peso (kg)'), '12,5');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar paciente' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.corpo).toMatchObject({ nome: 'Tobias', pesoEmGramas: 12_500 });
  });

  it('recusa peso fora de escala antes de deixar enviar', async () => {
    const { fetchFalso, enviados } = apiFalsa({
      '/receituario/tutores/': TUTOR,
      '/receituario/pacientes': { pacientes: [] },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/tutores/${TUTOR.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Novo paciente' }));

    await userEvent.type(screen.getByLabelText('Nome'), 'Tobias');
    // Gramas digitadas no campo de quilo: seria meia tonelada.
    await userEvent.type(screen.getByLabelText('Peso (kg)'), '12500');

    expect(await screen.findByRole('alert')).toHaveTextContent('confira a unidade');
    expect(screen.getByRole('button', { name: 'Cadastrar paciente' })).toBeDisabled();
    expect(enviados).toHaveLength(0);
  });

  /** Sem peso não há contra o que conferir a dose, e a emissão recusa depois. */
  it('avisa na lista quando o paciente está sem peso', async () => {
    const { fetchFalso } = apiFalsa({
      '/receituario/tutores/': TUTOR,
      '/receituario/pacientes': { pacientes: [{ ...PACIENTE, pesoEmGramas: null }] },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/tutores/${TUTOR.id}`);

    expect(await screen.findByText('sem peso')).toBeInTheDocument();
  });
});

describe('montagem da receita', () => {
  const base = {
    '/receituario/pacientes/': PACIENTE,
    '/catalogo/formas': {
      formas: [
        { id: 'ff55f4e0-0000-4000-8000-000000000001', nome: 'CÁPSULAS', aceitaAroma: false },
        { id: 'ff55f4e0-0000-4000-8000-000000000002', nome: 'BISCOITO', aceitaAroma: true },
      ],
    },
    '/catalogo/insumos': { insumos: [INSUMO] },
    // Veterinário sem vínculo: é o caso do autônomo, e a escolha de clínica
    // não aparece. Os testes com clínica vivem em `clinicas.test.tsx`.
    '/clinicas': { clinicas: [] },
  };

  async function montarFormula() {
    await userEvent.type(await screen.findByLabelText('Adicionar ativo'), 'gaba');
    await userEvent.click(await screen.findByRole('button', { name: /Gabapentina/ }));
    await userEvent.type(screen.getByLabelText('Dose (mg)'), '100');
  }

  it('mostra o preço vindo da cotação', async () => {
    const { fetchFalso } = apiFalsa({
      ...base,
      '/catalogo/orcamento': {
        valorFinalEmCentavos: 8_450,
        forma: 'CÁPSULAS',
        avisos: [],
        impedimentos: [],
      },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await montarFormula();

    expect(await screen.findByText('R$ 84,50')).toBeInTheDocument();
  });

  /**
   * Impedimento é a farmácia dizendo que não manipula aquilo. Deixar salvar
   * empurraria o problema para a emissão, que recusaria — depois de o
   * veterinário já ter falado o preço para o tutor.
   */
  it('bloqueia o rascunho quando a fórmula tem impedimento', async () => {
    const { fetchFalso, enviados } = apiFalsa({
      ...base,
      '/catalogo/orcamento': {
        valorFinalEmCentavos: 0,
        forma: 'PASTA',
        avisos: [],
        impedimentos: [{ insumoId: INSUMO.id, texto: 'Gabapentina não é manipulada em pasta.' }],
      },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await montarFormula();

    expect(await screen.findByText(/não é manipulada em pasta/)).toBeInTheDocument();
    // Preço não aparece: mostrar zero seria lido como "de graça".
    expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled(),
    );
    expect(enviados.filter((e) => e.url.includes('/receituario/receitas'))).toHaveLength(0);
  });

  it('mostra o aviso de dose fora da faixa sem impedir', async () => {
    const { fetchFalso } = apiFalsa({
      ...base,
      '/catalogo/orcamento': {
        valorFinalEmCentavos: 8_450,
        forma: 'CÁPSULAS',
        avisos: [
          { tipo: 'fora-da-faixa', insumoId: INSUMO.id, texto: 'Gabapentina está em 41,7 mg/kg.' },
        ],
        impedimentos: [],
      },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await montarFormula();

    expect(await screen.findByText(/41,7 mg\/kg/)).toBeInTheDocument();
    // Quem assina decide: o aviso informa, não trava.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled(),
    );
  });

  it('calcula a quantidade a partir da posologia', async () => {
    const { fetchFalso } = apiFalsa({
      ...base,
      '/catalogo/orcamento': {
        valorFinalEmCentavos: 100,
        forma: 'CÁPSULAS',
        avisos: [],
        impedimentos: [],
      },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);

    // 12 em 12 horas por 10 dias: duas por dia, vinte unidades.
    expect(await screen.findByText('20 unidades')).toBeInTheDocument();
  });

  it('recusa montar receita para paciente sem peso', async () => {
    const { fetchFalso } = apiFalsa({
      ...base,
      '/receituario/pacientes/': { ...PACIENTE, pesoEmGramas: null },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('sem peso registrado');
  });
});

describe('o que cada papel enxerga', () => {
  const FARMACIA = { ...VETERINARIO, papel: 'FARMACIA', crmv: null };

  /**
   * A farmácia lê a clientela — precisa, para manipular e entregar — mas não a
   * cadastra. Oferecer o botão levaria a um 403 da API: o dado fica protegido,
   * e a pessoa fica com um botão que nunca funciona.
   *
   * Achado no navegador, digitando /tutores na mão. O menu já escondia a aba;
   * a tela, aberta direto, não escondia o botão.
   */
  it('esconde o cadastro de tutor para a farmácia', async () => {
    const { fetchFalso } = apiFalsa({
      '/auth/eu': FARMACIA,
      '/receituario/tutores': { tutores: [] },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/tutores');

    await screen.findByRole('heading', { name: 'Tutores' });
    expect(screen.queryByRole('button', { name: 'Novo tutor' })).not.toBeInTheDocument();
  });

  it('mostra o cadastro de tutor para quem prescreve', async () => {
    const { fetchFalso } = apiFalsa({ '/receituario/tutores': { tutores: [] } });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/tutores');

    expect(await screen.findByRole('button', { name: 'Novo tutor' })).toBeInTheDocument();
  });

  it('não oferece “Prescrever” a quem não prescreve', async () => {
    const { fetchFalso } = apiFalsa({
      '/auth/eu': FARMACIA,
      '/receituario/tutores/': TUTOR,
      '/receituario/pacientes': { pacientes: [PACIENTE] },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/tutores/${TUTOR.id}`);

    await screen.findByText('Tobias');
    expect(screen.queryByRole('link', { name: 'Prescrever' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo paciente' })).not.toBeInTheDocument();
  });
});

/**
 * Pedidos da reunião de 11/09 na montagem da fórmula.
 */
describe('aroma e uso contínuo', () => {
  const base = {
    '/receituario/pacientes/': PACIENTE,
    '/catalogo/formas': {
      formas: [
        { id: 'ff55f4e0-0000-4000-8000-000000000001', nome: 'CÁPSULAS', aceitaAroma: false },
        { id: 'ff55f4e0-0000-4000-8000-000000000002', nome: 'BISCOITO', aceitaAroma: true },
      ],
    },
    '/catalogo/insumos': { insumos: [INSUMO] },
    '/clinicas': { clinicas: [] },
    '/catalogo/orcamento': {
      valorFinalEmCentavos: 8_450,
      forma: 'CÁPSULAS',
      avisos: [],
      impedimentos: [],
    },
  };

  async function montarFormula() {
    await userEvent.type(await screen.findByLabelText('Adicionar ativo'), 'gaba');
    await userEvent.click(await screen.findByRole('button', { name: /Gabapentina/ }));
    await userEvent.type(screen.getByLabelText('Dose (mg)'), '100');
  }

  it('não pede sabor numa cápsula', async () => {
    const { fetchFalso } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await screen.findByLabelText('Forma farmacêutica');

    expect(screen.queryByLabelText('Aroma')).not.toBeInTheDocument();
  });

  it('pede sabor quando a forma é comida pelo animal', async () => {
    const { fetchFalso } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await userEvent.selectOptions(
      await screen.findByLabelText('Forma farmacêutica'),
      'ff55f4e0-0000-4000-8000-000000000002',
    );

    expect(await screen.findByLabelText('Aroma')).toBeInTheDocument();
  });

  it('não deixa salvar biscoito sem sabor', async () => {
    const { fetchFalso } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await userEvent.selectOptions(
      await screen.findByLabelText('Forma farmacêutica'),
      'ff55f4e0-0000-4000-8000-000000000002',
    );
    await montarFormula();

    // Barrar aqui poupa a ida ao servidor e, mais importante, diz o que falta
    // antes de a pessoa achar que terminou.
    expect(screen.getByRole('button', { name: /Salvar rascunho/ })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Aroma'), 'FRANGO');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Salvar rascunho/ })).toBeEnabled(),
    );
  });

  it('esquece o sabor ao voltar para uma forma que não leva', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    const forma = await screen.findByLabelText('Forma farmacêutica');

    await userEvent.selectOptions(forma, 'ff55f4e0-0000-4000-8000-000000000002');
    await userEvent.selectOptions(await screen.findByLabelText('Aroma'), 'MORANGO');
    // Sem limpar, o sabor ficaria pendurado numa cápsula e a API recusaria.
    await userEvent.selectOptions(forma, 'ff55f4e0-0000-4000-8000-000000000001');
    await montarFormula();
    // A cotação é atrasada; o botão só habilita quando ela chega.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() =>
      expect(enviados.some((e) => e.url.includes('/receituario/receitas'))).toBe(true),
    );
    const corpo = enviados.find((e) => e.url.includes('/receituario/receitas'))?.corpo as {
      formulacoes: { aroma?: string }[];
    };
    expect(corpo.formulacoes[0]?.aroma).toBeUndefined();
  });

  it('manda o uso contínuo quando marcado', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await montarFormula();
    await userEvent.click(screen.getByLabelText('Uso contínuo'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() =>
      expect(enviados.some((e) => e.url.includes('/receituario/receitas'))).toBe(true),
    );
    const corpo = enviados.find((e) => e.url.includes('/receituario/receitas'))?.corpo as {
      formulacoes: { usoContinuo?: boolean }[];
    };
    expect(corpo.formulacoes[0]?.usoContinuo).toBe(true);
  });
});
