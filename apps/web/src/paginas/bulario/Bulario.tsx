import { useCallback, useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { useAtrasado, useConsulta } from '@/api/consulta';
import { Campo } from '@/componentes/Campo';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';
import { Formulacao } from './Formulacao';

type Resumo = components['schemas']['ListaDoBularioDto']['formulacoes'][number];
type Especie = Resumo['especies'][number];

const ESPECIES: { valor: Especie; rotulo: string }[] = [
  { valor: 'CANINO', rotulo: 'Cão' },
  { valor: 'FELINO', rotulo: 'Gato' },
  { valor: 'EQUINO', rotulo: 'Equino' },
  { valor: 'AVE', rotulo: 'Ave' },
  { valor: 'ROEDOR', rotulo: 'Roedor' },
  { valor: 'REPTIL', rotulo: 'Réptil' },
];

const ROTULO_DA_ESPECIE = new Map(ESPECIES.map((e) => [e.valor, e.rotulo]));

/**
 * O bulário magistral.
 *
 * Referência de consulta, e não montagem de receita: a ADR 0015 explica por
 * quê — 105 das 201 formulações com composição são dosadas só em percentual, e
 * o motor de preço não sabe essa conta. Aqui se lê o guia; a receita se monta
 * na tela de receita, com o catálogo.
 *
 * Isso não é pouco: é o material que hoje circula por e-mail e WhatsApp, com
 * 315 formulações em dezenove linhas terapêuticas.
 */
export function Bulario() {
  const [busca, setBusca] = useState('');
  const [linha, setLinha] = useState('');
  const [especie, setEspecie] = useState<Especie | ''>('');
  const [aberta, setAberta] = useState<string | null>(null);
  const buscaAtrasada = useAtrasado(busca);

  const carregar = useCallback(
    () =>
      exigir(
        api.GET('/api/v1/bulario', {
          params: {
            query: {
              ...(buscaAtrasada.trim() ? { busca: buscaAtrasada.trim() } : {}),
              ...(linha ? { linhaTerapeutica: linha } : {}),
              ...(especie ? { especie } : {}),
            },
          },
        }),
      ),
    [buscaAtrasada, linha, especie],
  );

  const { estado, recarregar } = useConsulta(
    `bulario:${buscaAtrasada}:${linha}:${especie}`,
    carregar,
  );

  /**
   * As linhas terapêuticas vêm numa consulta própria, de chave fixa.
   *
   * Na mesma consulta da lista, elas sumiam a cada tecla digitada: o
   * `useConsulta` volta para "carregando" quando a chave muda, e o seletor
   * ficava só com "Todas" enquanto a lista recarregava. O filtro piscava, e
   * quem estivesse escolhendo uma linha perdia a opção no meio do clique —
   * apareceu na conferência no navegador, não nos testes.
   *
   * E elas não dependem de filtro nenhum: são as dezenove linhas do bulário
   * com a contagem de cada uma. Rebuscá-las a cada tecla era trabalho jogado
   * fora, além do piscar.
   */
  const carregarLinhas = useCallback(() => exigir(api.GET('/api/v1/bulario/linhas')), []);
  const { estado: estadoDasLinhas } = useConsulta('bulario:linhas', carregarLinhas);
  const linhasDisponiveis = estadoDasLinhas.situacao === 'ok' ? estadoDasLinhas.dado.linhas : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Bulário</h1>
        <p className="mt-1 text-sm text-neutro-500">
          As formulações magistrais da farmácia. Procure pela doença, pelo ativo ou pelo nome.
        </p>
      </div>

      <Campo
        rotulo="Buscar"
        type="search"
        placeholder="otite, cetoconazol, xampu…"
        ajuda="A busca olha o título, a indicação e a composição ao mesmo tempo."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Seletor
          rotulo="Linha terapêutica"
          valor={linha}
          aoMudar={setLinha}
          vazio="Todas"
          opcoes={linhasDisponiveis.map((l) => ({
            valor: l.nome,
            rotulo: `${l.nome} (${l.quantidade})`,
          }))}
        />
        <Seletor
          rotulo="Espécie"
          valor={especie}
          aoMudar={(v) => setEspecie(v as Especie | '')}
          vazio="Todas"
          opcoes={ESPECIES.map((e) => ({ valor: e.valor, rotulo: e.rotulo }))}
          ajuda="Inclui as formulações que o guia não amarra a uma espécie."
        />
      </div>

      {estado.situacao === 'carregando' ? <Carregando o="o bulário" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} aoTentar={recarregar} /> : null}

      {estado.situacao === 'ok' ? (
        estado.dado.formulacoes.length === 0 ? (
          <Vazio
            icone={busca.trim() || linha || especie ? 'busca' : 'bulario'}
            titulo={busca.trim() || linha || especie ? 'Nada encontrado' : 'O bulário está vazio'}
          >
            {busca.trim() || linha || especie
              ? 'Nenhuma formulação com esses critérios. Tente um termo mais curto.'
              : 'Importe os guias com o comando bulario:importar.'}
          </Vazio>
        ) : (
          <>
            <p className="text-sm text-neutro-500">
              {estado.dado.total === 1 ? '1 formulação' : `${estado.dado.total} formulações`}
              {/* O teto é do servidor, e calar sobre ele faria a lista parecer
                  completa quando não está. */}
              {estado.dado.total > estado.dado.formulacoes.length
                ? ` — mostrando as ${estado.dado.formulacoes.length} primeiras`
                : ''}
            </p>

            <ul className="flex flex-col gap-2">
              {estado.dado.formulacoes.map((f) => (
                <li key={f.id}>
                  {aberta === f.id ? (
                    <Formulacao id={f.id} aoFechar={() => setAberta(null)} />
                  ) : (
                    <Linha formulacao={f} aoAbrir={() => setAberta(f.id)} />
                  )}
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </div>
  );
}

function Linha({ formulacao, aoAbrir }: { formulacao: Resumo; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="flex w-full flex-col gap-1 rounded-card border border-neutro-200 bg-neutro-0 px-4 py-3 text-left hover:bg-neutro-100"
    >
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm text-neutro-500">{formulacao.numero}</span>
        <span className="font-semibold text-neutro-900">{formulacao.titulo}</span>
        <Selo tom="neutro">{formulacao.linhaTerapeutica}</Selo>
        {formulacao.especies.map((e) => (
          <Selo key={e} tom="sucesso">
            {ROTULO_DA_ESPECIE.get(e) ?? e}
          </Selo>
        ))}
      </span>
      {formulacao.indicacao ? (
        <span className="text-sm text-neutro-500">{formulacao.indicacao}</span>
      ) : null}
    </button>
  );
}

function Seletor({
  rotulo,
  valor,
  aoMudar,
  vazio,
  opcoes,
  ajuda,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  vazio: string;
  opcoes: { valor: string; rotulo: string }[];
  ajuda?: string;
}) {
  const id = `filtro-${rotulo.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-neutro-700">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="min-h-[var(--altura-controle)] rounded-controle border border-neutro-200 bg-neutro-0 px-3 text-sm"
      >
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {ajuda ? <p className="text-xs text-neutro-500">{ajuda}</p> : null}
    </div>
  );
}
