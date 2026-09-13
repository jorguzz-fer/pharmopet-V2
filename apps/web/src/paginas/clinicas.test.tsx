import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rotas } from '@/rotas';
import { ProvedorDeSessao } from '@/sessao/ProvedorDeSessao';

type Fetch = typeof globalThis.fetch;

const ADMIN = {
  id: 'aa11f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Marcos Pharmo',
  email: 'marcos@pharmopet.test',
  papel: 'ADMIN',
  crmv: null,
};

const VETERINARIO = {
  id: 'bb22f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Renata Mattos',
  email: 'renata@clinica.test',
  papel: 'VETERINARIO',
  crmv: 'SP 28.114',
};

const DA_CLINICA = {
  id: 'cc33f4e0-3a4a-4a62-9d45-9c1f4a1d2b33',
  nome: 'Recepção Vida Animal',
  email: 'recepcao@vidaanimal.test',
  papel: 'CLINICA',
  crmv: null,
};

function clinica(sobre: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dd44f4e0-0000-4000-8000-000000000001',
    razaoSocial: 'Vida Animal Serviços Veterinários Ltda',
    nomeFantasia: 'Vida Animal',
    cnpj: '11.222.333/0001-81',
    inscricaoEstadual: null,
    email: 'contato@vidaanimal.test',
    telefone: '(11) 3333-4444',
    whatsapp: null,
    cep: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: 'São Paulo',
    uf: 'SP',
    responsavelLegal: 'Ana Prado',
    cpfDoResponsavel: null,
    situacao: 'ATIVA',
    observacoesInternas: null,
    temLogotipo: false,
    atualizadaEm: '2026-09-13T12:00:00.000Z',
    quantidadeDeUsuarios: 2,
    ...sobre,
  };
}

const OUTRA = clinica({
  id: 'dd44f4e0-0000-4000-8000-000000000002',
  nomeFantasia: 'Pet Center',
  razaoSocial: 'Pet Center Clínica Veterinária Ltda',
  cnpj: '11.222.333/0002-62',
});

const PACIENTE = {
  id: 'ee55f4e0-0000-4000-8000-000000000001',
  tutorId: 'ff66f4e0-0000-4000-8000-000000000001',
  tutorNome: 'Marina Prado',
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
  id: 'ee55f4e0-0000-4000-8000-000000000009',
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
 * As rotas que respondem sem corpo, como a API de verdade responde.
 *
 * Um dublê que devolvesse 200 com `{}` aqui seria mais fácil e mentiria: foi
 * exatamente isso que escondeu, até a conferência no navegador, o `exigir`
 * tratando 204 como falha e a tela dizendo "o sistema respondeu 204" depois de
 * um envio bem-sucedido.
 */
const SEM_CORPO = [
  { metodo: 'PUT', trecho: '/logotipo' },
  { metodo: 'POST', trecho: '/usuarios' },
  { metodo: 'DELETE', trecho: '/usuarios/' },
];

/**
 * Dublê da API que responde por rota e guarda o que recebeu.
 *
 * As chaves são conferidas na ordem em que aparecem, e a primeira que casar
 * responde: rotas mais específicas vêm antes das mais curtas, senão
 * `/clinicas` engoliria `/clinicas/<id>/usuarios`.
 */
function apiFalsa(respostas: Record<string, unknown> = {}) {
  const enviados: { url: string; metodo: string; corpo: unknown }[] = [];

  const fetchFalso = vi.fn<Fetch>(async (entrada, init) => {
    const pedido = entrada instanceof Request ? entrada : null;
    const url = String(pedido ? pedido.url : entrada);
    const metodo = pedido?.method ?? init?.method ?? 'GET';

    if (metodo !== 'GET') {
      const texto = pedido ? await pedido.clone().text() : String(init?.body ?? '');
      enviados.push({ url, metodo, corpo: texto ? JSON.parse(texto) : undefined });
    }

    if (SEM_CORPO.some((r) => r.metodo === metodo && url.includes(r.trecho))) {
      return new Response(null, { status: 204 });
    }

    for (const [trecho, resposta] of Object.entries(respostas)) {
      if (url.includes(trecho)) return json(resposta);
    }

    if (url.includes('/auth/eu')) return json(ADMIN);
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

describe('lista de clínicas', () => {
  it('mostra as clínicas com a situação escrita, não só colorida', async () => {
    const { fetchFalso } = apiFalsa({
      '/clinicas': { clinicas: [clinica(), clinica({ ...OUTRA, situacao: 'SUSPENSA' })] },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas');

    expect(await screen.findByText('Vida Animal')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    // Suspensa continua na lista: sumir seria indistinguível de nunca ter
    // existido, e quem procura por que o parceiro parou precisa encontrá-lo.
    expect(screen.getByText('Pet Center')).toBeInTheDocument();
    expect(screen.getByText('Suspensa')).toBeInTheDocument();
  });

  it('só oferece cadastro a quem administra', async () => {
    const { fetchFalso } = apiFalsa({
      '/auth/eu': DA_CLINICA,
      '/clinicas': { clinicas: [clinica()] },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas');

    await screen.findByText('Vida Animal');
    expect(screen.queryByRole('button', { name: 'Nova clínica' })).not.toBeInTheDocument();
  });
});

describe('cadastro de clínica', () => {
  it('recusa CNPJ inválido antes de deixar enviar', async () => {
    const { fetchFalso, enviados } = apiFalsa();
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas/nova');

    await userEvent.type(await screen.findByLabelText('Nome fantasia'), 'Vida Animal');
    await userEvent.type(screen.getByLabelText('Razão social'), 'Vida Animal Ltda');
    await userEvent.type(screen.getByLabelText('E-mail'), 'contato@vidaanimal.test');
    await userEvent.type(screen.getByLabelText('Responsável legal'), 'Ana Prado');
    // Treze dígitos: parece CNPJ e não é.
    await userEvent.type(screen.getByLabelText('CNPJ'), '1122233300018');

    expect(await screen.findByRole('alert')).toHaveTextContent('CNPJ inválido');
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled();
    expect(enviados).toHaveLength(0);
  });

  /**
   * Campo vazio precisa virar ausência, e não string vazia: um `telefone: ''`
   * seria recusado pela validação do servidor, e uma `cidade: ''` viraria dado
   * sujo que busca nenhuma acha.
   */
  it('manda campo não preenchido como nulo', async () => {
    const { fetchFalso, enviados } = apiFalsa({ '/clinicas': clinica() });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas/nova');

    await userEvent.type(await screen.findByLabelText('Nome fantasia'), 'Vida Animal');
    await userEvent.type(screen.getByLabelText('Razão social'), 'Vida Animal Ltda');
    await userEvent.type(screen.getByLabelText('E-mail'), 'contato@vidaanimal.test');
    await userEvent.type(screen.getByLabelText('Responsável legal'), 'Ana Prado');
    await userEvent.type(screen.getByLabelText('CNPJ'), '11222333000181');
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.corpo).toMatchObject({
      nomeFantasia: 'Vida Animal',
      cnpj: '11222333000181',
      telefone: null,
      cidade: null,
    });
  });
});

describe('ficha da clínica', () => {
  const base = {
    '/clinicas/dd44f4e0-0000-4000-8000-000000000001/usuarios': {
      vinculos: [
        {
          usuarioId: VETERINARIO.id,
          nome: VETERINARIO.nome,
          email: VETERINARIO.email,
          papel: 'VETERINARIO',
          crmv: VETERINARIO.crmv,
          cargo: 'Clínica geral',
        },
      ],
    },
    '/clinicas/dd44f4e0': clinica({ situacao: 'PENDENTE' }),
  };

  it('ativa uma clínica pendente', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas/dd44f4e0-0000-4000-8000-000000000001');

    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.metodo).toBe('PATCH');
    // Só a situação: aprovar não deve arrastar junto o resto do cadastro.
    expect(enviados[0]?.corpo).toEqual({ situacao: 'ATIVA' });
  });

  it('mostra quem atende na clínica', async () => {
    const { fetchFalso } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas/dd44f4e0-0000-4000-8000-000000000001');

    expect(await screen.findByText('Renata Mattos')).toBeInTheDocument();
    expect(screen.getByText('Clínica geral')).toBeInTheDocument();
  });

  /**
   * Encerrar vínculo tira de alguém o acesso à clientela inteira da clínica.
   * Um clique só, sem confirmação, erraria isso com a facilidade de um toque
   * torto no celular.
   */
  it('pede confirmação antes de encerrar um vínculo', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas/dd44f4e0-0000-4000-8000-000000000001');

    await userEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    expect(enviados).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]?.metodo).toBe('DELETE');
    expect(enviados[0]?.url).toContain(`/usuarios/${VETERINARIO.id}`);
    // A rota responde 204. Sucesso não pode virar recado de erro.
    expect(screen.queryByText(/respondeu 204/)).not.toBeInTheDocument();
  });

  it('envia o logotipo sem chamar sucesso de erro', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas/dd44f4e0-0000-4000-8000-000000000001');

    await screen.findByRole('heading', { name: 'Vida Animal' });

    const arquivo = new File([new Uint8Array([1, 2, 3, 4])], 'logo.png', { type: 'image/png' });
    // O input fica escondido atrás do botão — é o botão que a pessoa vê, e o
    // teste chega ao campo pelo que o DOM tem, não por um rótulo que não existe.
    const entrada = document.querySelector('input[type=file]') as HTMLInputElement;
    await userEvent.upload(entrada, arquivo);

    const envio = await waitFor(() => {
      const achado = enviados.find((e) => e.url.includes('/logotipo'));
      expect(achado).toBeDefined();
      return achado!;
    });
    expect(envio.metodo).toBe('PUT');
    // O base64 vai sem o prefixo `data:`, que o servidor não espera.
    expect(envio.corpo).toMatchObject({ tipo: 'image/png' });
    expect(String((envio.corpo as { conteudoBase64: string }).conteudoBase64)).not.toContain(
      'data:',
    );

    expect(screen.queryByText(/respondeu 204/)).not.toBeInTheDocument();
  });

  it('recusa arquivo acima do teto antes de subir', async () => {
    const { fetchFalso, enviados } = apiFalsa(base);
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas/dd44f4e0-0000-4000-8000-000000000001');
    await screen.findByRole('heading', { name: 'Vida Animal' });

    const grande = new File([new Uint8Array(600 * 1024)], 'grande.png', { type: 'image/png' });
    const entrada = document.querySelector('input[type=file]') as HTMLInputElement;
    await userEvent.upload(entrada, grande);

    expect(await screen.findByText(/passa de 512 KB/)).toBeInTheDocument();
    // Nem sai da máquina: meio megabyte subindo para ser recusado é desperdício.
    expect(enviados.filter((e) => e.url.includes('/logotipo'))).toHaveLength(0);
  });

  it('não oferece edição a quem não administra', async () => {
    const { fetchFalso } = apiFalsa({ '/auth/eu': DA_CLINICA, ...base });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/clinicas/dd44f4e0-0000-4000-8000-000000000001');

    await screen.findByRole('heading', { name: 'Vida Animal' });
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ativar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vincular pessoa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();
  });
});

describe('clínica na receita', () => {
  const base = {
    '/receituario/pacientes/': PACIENTE,
    '/catalogo/formas': {
      formas: [{ id: 'ff55f4e0-0000-4000-8000-000000000001', nome: 'CÁPSULAS' }],
    },
    '/catalogo/insumos': { insumos: [INSUMO] },
    '/catalogo/orcamento': {
      valorFinalEmCentavos: 8_450,
      forma: 'CÁPSULAS',
      avisos: [],
      impedimentos: [],
    },
    '/receituario/receitas': { id: 'ee55f4e0-0000-4000-8000-00000000000a' },
  };

  async function montarFormula() {
    await userEvent.type(await screen.findByLabelText('Adicionar ativo'), 'gaba');
    await userEvent.click(await screen.findByRole('button', { name: /Gabapentina/ }));
    await userEvent.type(screen.getByLabelText('Dose (mg)'), '100');
  }

  it('com uma clínica só, já vem escolhida e vai no rascunho', async () => {
    const { fetchFalso, enviados } = apiFalsa({
      '/auth/eu': VETERINARIO,
      '/clinicas': { clinicas: [clinica()] },
      ...base,
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await montarFormula();

    // Sem seletor: com uma opção só não há decisão a tomar.
    expect(screen.queryByLabelText('Onde este atendimento acontece')).not.toBeInTheDocument();
    expect(screen.getByText(/Vida Animal/)).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    const rascunho = await waitFor(() => {
      const achado = enviados.find((e) => e.url.includes('/receituario/receitas'));
      expect(achado).toBeDefined();
      return achado!;
    });
    expect(rascunho.corpo).toMatchObject({ clinicaId: clinica().id });
  });

  /**
   * Com mais de uma clínica, deixar em branco sairia sem logotipo e com o
   * preço de tabela — silenciosamente a receita errada, e a emissão congela a
   * clínica sem volta.
   */
  it('com mais de uma, exige escolher antes de salvar', async () => {
    const { fetchFalso, enviados } = apiFalsa({
      '/auth/eu': VETERINARIO,
      '/clinicas': { clinicas: [clinica(), OUTRA] },
      ...base,
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await montarFormula();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled(),
    );
    expect(screen.getByText('Escolha a clínica para poder salvar.')).toBeInTheDocument();
    expect(enviados.filter((e) => e.url.includes('/receituario/receitas'))).toHaveLength(0);

    await userEvent.selectOptions(
      screen.getByLabelText('Onde este atendimento acontece'),
      OUTRA.id,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    const rascunho = await waitFor(() => {
      const achado = enviados.find((e) => e.url.includes('/receituario/receitas'));
      expect(achado).toBeDefined();
      return achado!;
    });
    expect(rascunho.corpo).toMatchObject({ clinicaId: OUTRA.id });
  });

  /**
   * O preço depende do acordo da clínica. Trocar a clínica sem recotar
   * deixaria na tela um valor que a emissão não vai confirmar.
   */
  it('recota ao trocar de clínica', async () => {
    const { fetchFalso, enviados } = apiFalsa({
      '/auth/eu': VETERINARIO,
      '/clinicas': { clinicas: [clinica(), OUTRA] },
      ...base,
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar(`/receitas/nova?paciente=${PACIENTE.id}`);
    await montarFormula();

    await waitFor(() =>
      expect(enviados.some((e) => e.url.includes('/catalogo/orcamento'))).toBe(true),
    );
    const antes = enviados.filter((e) => e.url.includes('/catalogo/orcamento')).length;

    await userEvent.selectOptions(
      screen.getByLabelText('Onde este atendimento acontece'),
      OUTRA.id,
    );

    await waitFor(() => {
      const cotacoes = enviados.filter((e) => e.url.includes('/catalogo/orcamento'));
      expect(cotacoes.length).toBeGreaterThan(antes);
      expect(cotacoes.at(-1)?.corpo).toMatchObject({ clinicaId: OUTRA.id });
    });
  });

  /** Congelada na emissão: vale o nome de então, não o do cadastro de hoje. */
  it('mostra a clínica congelada na receita emitida', async () => {
    const { fetchFalso } = apiFalsa({
      '/auth/eu': VETERINARIO,
      '/receituario/receitas/': {
        id: 'ee55f4e0-0000-4000-8000-00000000000a',
        numero: 7,
        estado: 'EMITIDA',
        situacao: 'valida',
        veterinarioId: VETERINARIO.id,
        veterinarioNome: VETERINARIO.nome,
        crmv: VETERINARIO.crmv,
        pacienteId: PACIENTE.id,
        pacienteNome: PACIENTE.nome,
        tutorNome: PACIENTE.tutorNome,
        clinicaId: clinica().id,
        clinicaNome: 'Vida Animal (nome de então)',
        clinicaCnpj: '11.222.333/0001-81',
        pesoDoPacienteEmGramas: 12_000,
        emitidaEm: '2026-09-10T12:00:00.000Z',
        validaAte: '2026-10-10T12:00:00.000Z',
        prazoEmDias: 30,
        prazoMotivo: 'Lista C1: 30 dias.',
        canceladaEm: null,
        motivoDoCancelamento: null,
        observacoes: null,
        formulacoes: [],
        valorTotalEmCentavos: 8_450,
        criadaEm: '2026-09-10T11:00:00.000Z',
      },
    });
    vi.stubGlobal('fetch', fetchFalso);

    montar('/receitas/ee55f4e0-0000-4000-8000-00000000000a');

    expect(await screen.findByText('Vida Animal (nome de então)')).toBeInTheDocument();
    expect(screen.getByText('11.222.333/0001-81')).toBeInTheDocument();
  });
});
