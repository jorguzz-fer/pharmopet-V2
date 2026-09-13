import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { formatarPeso, formatarReais, quantidadeDeDoses } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { mensagemDeErro, useAtrasado, useConsulta } from '@/api/consulta';
import { Aviso, tomDoAviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';

// O insumo não tem schema próprio no contrato: vive dentro da lista. Indexar
// daqui mantém o tipo amarrado ao contrato, em vez de recriá-lo à mão.
type Insumo = components['schemas']['ListaDeInsumosDto']['insumos'][number];
type Orcamento = components['schemas']['OrcamentoDto'];
type Clinica = components['schemas']['ClinicaDto'];

/** Um ativo da fórmula, do jeito que a tela o guarda enquanto se monta. */
type ItemEmEdicao = { insumo: Insumo; doseMg: string };

const FREQUENCIAS = [
  { horas: 24, rotulo: '1× ao dia (24h)' },
  { horas: 12, rotulo: '2× ao dia (12h)' },
  { horas: 8, rotulo: '3× ao dia (8h)' },
  { horas: 6, rotulo: '4× ao dia (6h)' },
] as const;

/**
 * Montagem da receita.
 *
 * O preço e a conferência de dose aparecem enquanto se monta, e não no fim:
 * saber que a fórmula saiu da faixa depois de escolher tudo obriga a refazer,
 * e saber o preço só no fim tira do veterinário a chance de ajustar antes de
 * falar com o tutor.
 *
 * A cotação usa `/catalogo/orcamento`, que não grava nada. Criar um rascunho a
 * cada tecla encheria o banco de receita que ninguém quis.
 */
export function NovaReceita() {
  const [params] = useSearchParams();
  const pacienteId = params.get('paciente') ?? '';
  const navegar = useNavigate();

  const carregarBase = useCallback(
    async () => ({
      paciente: await exigir(
        api.GET('/api/v1/receituario/pacientes/{id}', { params: { path: { id: pacienteId } } }),
      ),
      formas: await exigir(api.GET('/api/v1/catalogo/formas')),
      // As clínicas onde quem prescreve atende. A API já devolve só os
      // vínculos ativos (ADR 0012) — a tela não repete a regra.
      clinicas: await exigir(api.GET('/api/v1/clinicas', {})),
    }),
    [pacienteId],
  );

  const { estado, recarregar } = useConsulta(`nova:${pacienteId}`, carregarBase);

  if (!pacienteId) {
    return <Falha motivo="Escolha um paciente na ficha do tutor para começar a receita." />;
  }
  if (estado.situacao === 'carregando') return <Carregando o="o paciente" />;
  if (estado.situacao === 'falha') return <Falha motivo={estado.motivo} aoTentar={recarregar} />;

  const { paciente, formas, clinicas } = estado.dado;

  if (paciente.pesoEmGramas === null) {
    return (
      <div className="flex flex-col gap-4">
        <Falha motivo="Este paciente está sem peso registrado, e a dose é conferida contra o peso." />
        <Link to={`/tutores/${paciente.tutorId}`} className="text-sm text-turquesa-700 underline">
          Registrar o peso na ficha
        </Link>
      </div>
    );
  }

  return (
    <Montagem
      paciente={paciente}
      formas={formas.formas}
      clinicas={clinicas.clinicas}
      aoSalvar={(id) => navegar(`/receitas/${id}`)}
    />
  );
}

function Montagem({
  paciente,
  formas,
  clinicas,
  aoSalvar,
}: {
  paciente: components['schemas']['PacienteDto'];
  formas: { id: string; nome: string }[];
  clinicas: Clinica[];
  aoSalvar: (id: string) => void;
}) {
  const [formaId, setFormaId] = useState(formas[0]?.id ?? '');
  // Com uma clínica só, já vem escolhida: perguntar o óbvio a cada receita é
  // um clique por prescrição sem nenhuma decisão por trás.
  const [clinicaId, setClinicaId] = useState(clinicas.length === 1 ? clinicas[0]!.id : '');
  const [itens, setItens] = useState<ItemEmEdicao[]>([]);
  const [frequenciaHoras, setFrequencia] = useState<24 | 12 | 8 | 6>(12);
  const [dias, setDias] = useState('10');
  const [orientacao, setOrientacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const diasNumero = Number(dias) || 0;
  const quantidade = diasNumero > 0 ? quantidadeDeDoses(frequenciaHoras, diasNumero) : 0;

  // Itens com dose preenchida e válida são os únicos que o orçamento aceita.
  const itensProntos = useMemo(
    () =>
      itens
        .map((i) => ({ insumoId: i.insumo.id, doseMg: Number(i.doseMg.replace(',', '.')) }))
        .filter((i) => Number.isFinite(i.doseMg) && i.doseMg > 0),
    [itens],
  );

  // `clinicaId` entra na chave porque muda o preço: o desconto e a taxa de
  // manipulação são do acordo daquela clínica. Trocar de clínica sem recotar
  // deixaria na tela um valor que a emissão não vai confirmar.
  const chave = useAtrasado(
    JSON.stringify({ formaId, clinicaId, itensProntos, quantidade, peso: paciente.pesoEmGramas }),
  );

  const cotar = useCallback(async (): Promise<Orcamento | null> => {
    const pedido = JSON.parse(chave) as {
      formaId: string;
      clinicaId: string;
      itensProntos: { insumoId: string; doseMg: number }[];
      quantidade: number;
      peso: number | null;
    };

    if (!pedido.formaId || pedido.itensProntos.length === 0 || pedido.quantidade <= 0) return null;

    return exigir(
      api.POST('/api/v1/catalogo/orcamento', {
        body: {
          formaId: pedido.formaId,
          ...(pedido.clinicaId ? { clinicaId: pedido.clinicaId } : {}),
          itens: pedido.itensProntos.map((i) => ({ ...i, quantidade: pedido.quantidade })),
          ...(pedido.peso === null
            ? {}
            : { paciente: { especie: paciente.especie, pesoEmGramas: pedido.peso } }),
        },
      }),
    );
  }, [chave, paciente.especie]);

  const { estado: cotacao } = useConsulta(`orcamento:${chave}`, cotar);

  const orcamento = cotacao.situacao === 'ok' ? cotacao.dado : null;
  const impedido = (orcamento?.impedimentos.length ?? 0) > 0;
  // Com mais de uma clínica, escolher é obrigatório. Deixar em branco sairia
  // sem logotipo e com o preço de tabela — silenciosamente a receita errada,
  // e a emissão congela a clínica sem volta.
  const faltaClinica = clinicas.length > 1 && clinicaId === '';
  const podeSalvar =
    itensProntos.length > 0 && quantidade > 0 && !impedido && !faltaClinica && !salvando;

  async function salvar() {
    setErro(null);
    setSalvando(true);

    try {
      const receita = await exigir(
        api.POST('/api/v1/receituario/receitas', {
          body: {
            pacienteId: paciente.id,
            ...(clinicaId ? { clinicaId } : {}),
            formulacoes: [
              {
                formaId,
                frequenciaHoras,
                dias: diasNumero,
                quantidade,
                ...(orientacao.trim() ? { orientacao: orientacao.trim() } : {}),
                itens: itensProntos,
              },
            ],
          },
        }),
      );
      aoSalvar(receita.id);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/tutores/${paciente.tutorId}`}
          className="text-sm text-turquesa-700 hover:underline"
        >
          ← {paciente.tutorNome}
        </Link>
        <h1 className="mt-1 font-titulo text-2xl font-extrabold tracking-tight">
          Receita para {paciente.nome}
        </h1>
        <p className="mt-1 text-sm text-neutro-500">
          {paciente.especie.toLowerCase()} ·{' '}
          {paciente.pesoEmGramas === null ? 'sem peso' : formatarPeso(paciente.pesoEmGramas)}
        </p>
      </div>

      <EscolhaDaClinica clinicas={clinicas} escolhida={clinicaId} aoEscolher={setClinicaId} />

      <Cartao titulo="Fórmula">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="forma" className="text-sm font-semibold text-neutro-700">
              Forma farmacêutica
            </label>
            <select
              id="forma"
              className="min-h-[var(--altura-controle)] w-full rounded-controle border border-neutro-200 bg-neutro-0 px-3 text-base"
              value={formaId}
              onChange={(e) => setFormaId(e.target.value)}
            >
              {formas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>

          <Ativos itens={itens} aoMudar={setItens} />
        </div>
      </Cartao>

      <Cartao titulo="Posologia">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="frequencia" className="text-sm font-semibold text-neutro-700">
              Frequência
            </label>
            <select
              id="frequencia"
              className="min-h-[var(--altura-controle)] w-full rounded-controle border border-neutro-200 bg-neutro-0 px-3 text-base"
              value={frequenciaHoras}
              onChange={(e) => setFrequencia(Number(e.target.value) as 24 | 12 | 8 | 6)}
            >
              {FREQUENCIAS.map((f) => (
                <option key={f.horas} value={f.horas}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </div>

          <Campo
            rotulo="Duração (dias)"
            inputMode="numeric"
            value={dias}
            onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))}
          />

          <div className="flex flex-col justify-end">
            <p className="text-sm text-neutro-500">A manipular</p>
            <p className="font-titulo text-xl font-bold text-neutro-900">
              {quantidade > 0 ? `${quantidade} unidades` : '—'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Campo
            rotulo="Orientação ao tutor"
            placeholder="Dar com comida, à noite…"
            value={orientacao}
            onChange={(e) => setOrientacao(e.target.value)}
          />
        </div>
      </Cartao>

      <Resumo cotacao={cotacao} temItens={itensProntos.length > 0 && quantidade > 0} />

      {erro ? (
        <p
          role="alert"
          className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
        >
          {erro}
        </p>
      ) : null}

      <Botao onClick={salvar} disabled={!podeSalvar} larguraTotal>
        {salvando ? 'Salvando…' : 'Salvar rascunho'}
      </Botao>
      <p className="-mt-4 text-center text-xs text-neutro-500">
        {faltaClinica
          ? 'Escolha a clínica para poder salvar.'
          : 'O rascunho pode ser alterado. A emissão é o passo seguinte, e congela a receita.'}
      </p>
    </div>
  );
}

/**
 * De qual clínica é esta receita.
 *
 * Decide três coisas: o logotipo e os dados do cabeçalho, o preço (cada
 * parceiro tem seu acordo) e quem mais enxerga a ficha depois. Some quando não
 * há o que decidir — sem vínculo nenhum, é receita de autônomo; com um só, já
 * vem escolhida e a tela apenas informa qual.
 */
function EscolhaDaClinica({
  clinicas,
  escolhida,
  aoEscolher,
}: {
  clinicas: Clinica[];
  escolhida: string;
  aoEscolher: (id: string) => void;
}) {
  if (clinicas.length === 0) return null;

  if (clinicas.length === 1) {
    return (
      <Cartao titulo="Clínica">
        <p className="text-sm text-neutro-700">
          {clinicas[0]!.nomeFantasia}
          <span className="ml-2 text-neutro-500">
            — o cabeçalho e o preço da receita vêm daqui.
          </span>
        </p>
      </Cartao>
    );
  }

  return (
    <Cartao titulo="Clínica">
      <div className="flex flex-col gap-1">
        <label htmlFor="clinica" className="text-sm font-semibold text-neutro-700">
          Onde este atendimento acontece
        </label>
        <select
          id="clinica"
          className="min-h-[var(--altura-controle)] w-full rounded-controle border border-neutro-200 bg-neutro-0 px-3 text-base"
          value={escolhida}
          onChange={(e) => aoEscolher(e.target.value)}
        >
          <option value="">Escolha…</option>
          {clinicas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nomeFantasia}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutro-500">
          Define o cabeçalho da receita e o preço. Depois de emitida, não muda.
        </p>
      </div>
    </Cartao>
  );
}

/** Busca de insumo e a lista do que já entrou na fórmula. */
function Ativos({
  itens,
  aoMudar,
}: {
  itens: ItemEmEdicao[];
  aoMudar: (itens: ItemEmEdicao[]) => void;
}) {
  const [busca, setBusca] = useState('');
  const buscaAtrasada = useAtrasado(busca);

  const buscar = useCallback(async () => {
    if (buscaAtrasada.trim().length < 2) return { insumos: [] };
    return exigir(
      api.GET('/api/v1/catalogo/insumos', { params: { query: { busca: buscaAtrasada.trim() } } }),
    );
  }, [buscaAtrasada]);

  const { estado } = useConsulta(`insumos:${buscaAtrasada}`, buscar);
  const achados = estado.situacao === 'ok' ? estado.dado.insumos : [];
  const jaNaFormula = new Set(itens.map((i) => i.insumo.id));

  return (
    <div className="flex flex-col gap-4">
      {itens.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {itens.map((item, i) => (
            <li
              key={item.insumo.id}
              className="flex flex-wrap items-end gap-3 rounded-card border border-neutro-200 px-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-neutro-900">{item.insumo.descricao}</p>
                <p className="mt-1 flex flex-wrap gap-2">
                  <span className="text-xs text-neutro-500">código {item.insumo.codigo}</span>
                  {item.insumo.controlado ? (
                    <Selo tom="controlado">{item.insumo.listaDeControle ?? 'controlado'}</Selo>
                  ) : null}
                  {item.insumo.estoque === 'em-falta' ? (
                    <Selo tom="antimicrobiano">em falta</Selo>
                  ) : null}
                </p>
              </div>

              <div className="w-32">
                <Campo
                  rotulo="Dose (mg)"
                  inputMode="decimal"
                  value={item.doseMg}
                  onChange={(e) =>
                    aoMudar(itens.map((x, j) => (j === i ? { ...x, doseMg: e.target.value } : x)))
                  }
                />
              </div>

              <Botao
                tom="perigo"
                onClick={() => aoMudar(itens.filter((_, j) => j !== i))}
                aria-label={`Remover ${item.insumo.descricao}`}
              >
                Remover
              </Botao>
            </li>
          ))}
        </ul>
      ) : null}

      <Campo
        rotulo="Adicionar ativo"
        type="search"
        placeholder="Nome ou código do insumo"
        ajuda="A partir de duas letras."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {achados.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {achados
            .filter((i) => !jaNaFormula.has(i.id))
            .slice(0, 8)
            .map((insumo) => (
              <li key={insumo.id}>
                <button
                  type="button"
                  onClick={() => {
                    aoMudar([...itens, { insumo, doseMg: '' }]);
                    setBusca('');
                  }}
                  className="flex min-h-[var(--altura-controle)] w-full flex-wrap items-center gap-2 rounded-controle px-3 text-left text-sm hover:bg-neutro-100"
                >
                  <span className="font-semibold">{insumo.descricao}</span>
                  <span className="text-neutro-500">{insumo.codigo}</span>
                  {insumo.controlado ? (
                    <Selo tom="controlado">{insumo.listaDeControle ?? 'controlado'}</Selo>
                  ) : null}
                </button>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Preço e recados da cotação. */
function Resumo({
  cotacao,
  temItens,
}: {
  cotacao: ReturnType<typeof useConsulta<Orcamento | null>>['estado'];
  temItens: boolean;
}) {
  if (!temItens) {
    return (
      <Cartao titulo="Orçamento">
        <p className="text-sm text-neutro-500">
          Escolha os ativos e a posologia para ver o preço e a conferência de dose.
        </p>
      </Cartao>
    );
  }

  if (cotacao.situacao === 'carregando') {
    return (
      <Cartao titulo="Orçamento">
        <Carregando o="o orçamento" />
      </Cartao>
    );
  }

  if (cotacao.situacao === 'falha') {
    return (
      <Cartao titulo="Orçamento">
        <Falha motivo={cotacao.motivo} />
      </Cartao>
    );
  }

  const orcamento = cotacao.dado;
  if (!orcamento) return null;

  const impedido = orcamento.impedimentos.length > 0;

  return (
    <Cartao titulo="Orçamento">
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm text-neutro-500">{orcamento.forma}</span>
          <span className="font-titulo text-3xl font-extrabold text-neutro-900">
            {/* Fórmula impedida não tem preço, e mostrar zero seria pior do que
                mostrar nada: alguém leria como "de graça". */}
            {impedido ? '—' : formatarReais(orcamento.valorFinalEmCentavos)}
          </span>
        </div>

        {orcamento.impedimentos.map((i, n) => (
          <Aviso key={`imp-${n}`} tom="impedimento">
            {i.texto}
          </Aviso>
        ))}

        {orcamento.avisos.map((a, n) => (
          <Aviso key={`av-${n}`} tom={tomDoAviso(a.tipo)}>
            {a.texto}
          </Aviso>
        ))}
      </div>
    </Cartao>
  );
}
