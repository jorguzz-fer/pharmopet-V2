import { useCallback, useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro, useAtrasado, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';

type Restricao = components['schemas']['ListaDeRestricoesDto']['restricoes'][number];
type Forma = components['schemas']['ListaDeFormasDto']['formas'][number];
type InsumoPublico = components['schemas']['ListaDeInsumosDto']['insumos'][number];

/**
 * "Não faz em pasta", e as outras regras do mesmo tipo.
 *
 * São poucas e se revisam juntas, então a lista vem inteira — não paginada,
 * não dentro de cada insumo. Uma restrição vira impedimento no orçamento, e
 * impedimento trava a emissão: é a regra mais consequente do catálogo por
 * linha escrita, e merece uma tela onde dê para ler todas de uma vez.
 */
export function Restricoes() {
  const [adicionando, setAdicionando] = useState(false);

  const carregar = useCallback(
    async () => ({
      restricoes: (await exigir(api.GET('/api/v1/catalogo/restricoes'))).restricoes,
      formas: (await exigir(api.GET('/api/v1/catalogo/formas'))).formas,
    }),
    [],
  );
  const { estado, recarregar } = useConsulta('restricoes', carregar);

  if (estado.situacao === 'carregando') return <Carregando o="as restrições" />;
  if (estado.situacao === 'falha') return <Falha motivo={estado.motivo} aoTentar={recarregar} />;

  const { restricoes, formas } = estado.dado;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutro-500">
          {restricoes.length === 1 ? '1 proibição' : `${restricoes.length} proibições`}
        </p>
        {!adicionando ? (
          <Botao onClick={() => setAdicionando(true)}>Proibir combinação</Botao>
        ) : null}
      </div>

      {adicionando ? (
        <Nova
          formas={formas}
          aoFechar={() => setAdicionando(false)}
          aoCriar={() => {
            setAdicionando(false);
            recarregar();
          }}
        />
      ) : null}

      {restricoes.length === 0 ? (
        <Vazio>
          Nenhuma proibição cadastrada. Elas vêm do arquivo de exceções da farmácia, na importação,
          ou daqui.
        </Vazio>
      ) : (
        <ul className="flex flex-col gap-2">
          {restricoes.map((r) => (
            <li key={`${r.insumoId}:${r.formaId}`}>
              <Linha restricao={r} aoRemover={recarregar} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Linha({ restricao, aoRemover }: { restricao: Restricao; aoRemover: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function remover() {
    setErro(null);
    setOcupado(true);
    try {
      await exigir(
        api.DELETE('/api/v1/catalogo/restricoes/{insumoId}/{formaId}', {
          params: { path: { insumoId: restricao.insumoId, formaId: restricao.formaId } },
        }),
      );
      aoRemover();
    } catch (e) {
      setErro(mensagemDeErro(e));
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-neutro-200 bg-neutro-0 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm text-neutro-500">{restricao.insumoCodigo}</span>
        <span className="font-semibold text-neutro-900">{restricao.insumoDescricao}</span>
        <span className="text-sm text-neutro-500">não faz em</span>
        <span className="font-semibold text-neutro-900">{restricao.formaNome}</span>
        <div className="ml-auto">
          <Botao tom="secundario" onClick={remover} disabled={ocupado}>
            {ocupado ? 'Removendo…' : 'Levantar'}
          </Botao>
        </div>
      </div>
      <p className="text-sm text-neutro-500">{restricao.motivo}</p>
      {erro ? (
        <p role="alert" className="text-sm text-controlado-texto">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

function Nova({
  formas,
  aoFechar,
  aoCriar,
}: {
  formas: Forma[];
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<InsumoPublico | null>(null);
  const [formaId, setFormaId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const buscaAtrasada = useAtrasado(busca);

  const procurar = useCallback(async () => {
    const termo = buscaAtrasada.trim();
    if (termo.length < 2) return { insumos: [] as InsumoPublico[] };

    return exigir(api.GET('/api/v1/catalogo/insumos', { params: { query: { busca: termo } } }));
  }, [buscaAtrasada]);
  const { estado } = useConsulta(`proibir:${buscaAtrasada}`, procurar);

  const achados = estado.situacao === 'ok' ? estado.dado.insumos.slice(0, 8) : [];
  const pronto = escolhido !== null && formaId !== '' && motivo.trim().length >= 3;

  async function criar() {
    if (!pronto || escolhido === null) return;

    setErro(null);
    setSalvando(true);
    try {
      await exigir(
        api.POST('/api/v1/catalogo/restricoes', {
          body: { insumoId: escolhido.id, formaId, motivo: motivo.trim() },
        }),
      );
      aoCriar();
    } catch (e) {
      setErro(mensagemDeErro(e));
      setSalvando(false);
    }
  }

  return (
    <Cartao titulo="Proibir um insumo numa forma">
      <div className="flex flex-col gap-4">
        {erro ? (
          <p
            role="alert"
            className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
          >
            {erro}
          </p>
        ) : null}

        {escolhido === null ? (
          <>
            <Campo
              rotulo="Insumo"
              type="search"
              placeholder="Nome ou código"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {achados.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {achados.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => setEscolhido(i)}
                      className="flex w-full min-h-[var(--altura-controle)] items-center gap-3 rounded-controle px-3 text-left text-sm hover:bg-neutro-100"
                    >
                      <span className="font-mono text-neutro-500">{i.codigo}</span>
                      <span className="font-semibold text-neutro-900">{i.descricao}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono text-neutro-500">{escolhido.codigo}</span>
            <span className="font-semibold text-neutro-900">{escolhido.descricao}</span>
            <button
              type="button"
              onClick={() => setEscolhido(null)}
              className="text-turquesa-700 underline"
            >
              trocar
            </button>
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="forma-proibida" className="text-sm font-semibold text-neutro-900">
            Forma proibida
          </label>
          <select
            id="forma-proibida"
            value={formaId}
            onChange={(e) => setFormaId(e.target.value)}
            className="min-h-[var(--altura-controle)] rounded-controle border border-neutro-200 bg-neutro-0 px-3 text-sm"
          >
            <option value="">Escolha uma forma</option>
            {formas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>

        <Campo
          rotulo="Motivo"
          placeholder="Não se manipula em pasta."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          ajuda="Aparece para quem prescreve, no lugar do preço. Diga por que, não só que não pode."
        />

        <div className="flex flex-wrap gap-2">
          <Botao onClick={criar} disabled={!pronto || salvando}>
            {salvando ? 'Salvando…' : 'Proibir'}
          </Botao>
          <Botao tom="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </div>
    </Cartao>
  );
}
