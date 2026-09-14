import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { useAtrasado, useConsulta } from '@/api/consulta';
import { Campo } from '@/componentes/Campo';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';
import { Insumo } from './Insumo';
import { Restricoes } from './Restricoes';

type InsumoPublico = components['schemas']['ListaDeInsumosDto']['insumos'][number];

const ABAS = [
  { chave: 'insumos', rotulo: 'Insumos' },
  { chave: 'controlados', rotulo: 'Controlados' },
  { chave: 'restricoes', rotulo: 'Restrições' },
] as const;

type Aba = (typeof ABAS)[number]['chave'];

/**
 * O catálogo, para quem administra a farmácia.
 *
 * As três abas são as mesmas da v1, porque são as três perguntas que a
 * farmácia faz do catálogo: o que existe, o que é controlado e o que não se
 * manipula em qual forma.
 *
 * O que **não** está aqui, e é de propósito: cadastrar insumo um a um. O
 * catálogo tem setecentas linhas e vem do export da farmácia — quem digita
 * setecentas linhas à mão erra, e erra em silêncio. A entrada é o comando
 * `catalogo:importar`, que recusa o que não sabe precificar. Esta tela é para
 * corrigir o que o export não diz.
 */
export function Catalogo() {
  const [params, setParams] = useSearchParams();
  const bruta = params.get('aba');
  const aba: Aba = ABAS.some((a) => a.chave === bruta) ? (bruta as Aba) : 'insumos';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Catálogo</h1>
        <p className="mt-1 text-sm text-neutro-500">
          O que a farmácia manipula. Os insumos entram pelo comando de importação; aqui se corrige o
          que o export não diz.
        </p>
      </div>

      {/* A aba vai para a URL: recarregar cai no mesmo lugar, e um link para
          "as restrições" é um link, não uma instrução de onde clicar. */}
      <div role="tablist" aria-label="Seções do catálogo" className="flex flex-wrap gap-1">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={aba === a.chave}
            onClick={() => setParams(a.chave === 'insumos' ? {} : { aba: a.chave })}
            className={[
              'flex min-h-[var(--altura-controle)] items-center rounded-controle px-3 text-sm',
              aba === a.chave
                ? 'bg-turquesa-50 font-semibold text-turquesa-900'
                : 'text-neutro-500 hover:bg-neutro-100',
            ].join(' ')}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {aba === 'insumos' ? <ListaDeInsumos somenteControlados={false} /> : null}
        {aba === 'controlados' ? <ListaDeInsumos somenteControlados /> : null}
        {aba === 'restricoes' ? <Restricoes /> : null}
      </div>
    </div>
  );
}

/**
 * A busca do catálogo, e o insumo aberto para correção.
 *
 * A mesma lista serve às duas primeiras abas: "controlados" é esta filtrada. A
 * v1 tinha duas telas quase iguais, e a segunda era a que ficava para trás.
 */
function ListaDeInsumos({ somenteControlados }: { somenteControlados: boolean }) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const buscaAtrasada = useAtrasado(busca);

  const carregar = useCallback(
    () =>
      exigir(
        api.GET('/api/v1/catalogo/insumos', {
          params: { query: buscaAtrasada.trim() ? { busca: buscaAtrasada.trim() } : {} },
        }),
      ),
    [buscaAtrasada],
  );

  const { estado, recarregar } = useConsulta(`catalogo:${buscaAtrasada}`, carregar);

  const visiveis: InsumoPublico[] =
    estado.situacao === 'ok'
      ? estado.dado.insumos.filter((i) => !somenteControlados || i.controlado)
      : [];

  return (
    <div className="flex flex-col gap-4">
      <Campo
        rotulo="Buscar"
        type="search"
        placeholder="Nome ou código"
        ajuda="A busca vai ao servidor e traz no máximo cinquenta linhas."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {estado.situacao === 'carregando' ? <Carregando o="o catálogo" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} aoTentar={recarregar} /> : null}

      {estado.situacao === 'ok' && visiveis.length === 0 ? (
        <Vazio
          icone={somenteControlados || busca.trim() ? 'busca' : 'catalogo'}
          titulo={somenteControlados || busca.trim() ? 'Nada encontrado' : 'O catálogo está vazio'}
        >
          {somenteControlados
            ? 'Nenhum insumo controlado entre os encontrados. Marque um pela aba Insumos.'
            : busca.trim()
              ? 'Nenhum insumo com esse nome ou código.'
              : 'Importe o export da farmácia com o comando catalogo:importar.'}
        </Vazio>
      ) : null}

      {visiveis.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {visiveis.map((i) => (
            <li key={i.id}>
              {aberto === i.id ? (
                <Insumo
                  id={i.id}
                  aoFechar={() => setAberto(null)}
                  aoSalvar={() => {
                    setAberto(null);
                    recarregar();
                  }}
                />
              ) : (
                <Linha insumo={i} aoAbrir={() => setAberto(i.id)} />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {/* O teto é do servidor, e calar sobre ele faria a lista parecer completa. */}
      {estado.situacao === 'ok' && estado.dado.insumos.length === 50 ? (
        <p className="text-center text-xs text-neutro-500">
          Cinquenta primeiros. Refine a busca para ver o resto.
        </p>
      ) : null}
    </div>
  );
}

function Linha({ insumo, aoAbrir }: { insumo: InsumoPublico; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="flex w-full min-h-[var(--altura-controle)] flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-neutro-200 bg-neutro-0 px-4 py-3 text-left hover:bg-neutro-100"
    >
      <span className="font-mono text-sm text-neutro-500">{insumo.codigo}</span>
      <span className="font-semibold text-neutro-900">{insumo.descricao}</span>
      {insumo.controlado ? (
        <Selo tom={insumo.listaDeControle === 'ANTIMICROBIANO' ? 'antimicrobiano' : 'controlado'}>
          {insumo.listaDeControle ?? 'controlado'}
        </Selo>
      ) : null}
      {insumo.formasProibidas.length > 0 ? (
        <Selo tom="neutro">
          {insumo.formasProibidas.length === 1
            ? '1 forma proibida'
            : `${insumo.formasProibidas.length} formas proibidas`}
        </Selo>
      ) : null}
      {/* Só a situação, nunca a quantidade: o número é comercial da farmácia. */}
      {insumo.estoque === 'em-falta' ? <Selo tom="controlado">em falta</Selo> : null}
      {insumo.estoque === 'desconhecido' ? <Selo tom="neutro">estoque não informado</Selo> : null}
    </button>
  );
}
