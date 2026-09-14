import { useCallback } from 'react';
import { Link } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { useConsulta } from '@/api/consulta';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Selo, type TomDoSelo } from '@/componentes/Selo';
import { aparenciaDeBotao } from '@/componentes/Botao';
import type { Papel } from '@/sessao/papeis';
import { usePapel, usePodePrescrever } from '@/sessao/SessaoContexto';

type Resumida = components['schemas']['ListaDeReceitasDto']['receitas'][number];

/**
 * O que dizer quando não há receita nenhuma.
 *
 * Depende do papel porque a frase única — "comece pela ficha de um tutor" —
 * mandava a farmácia a uma aba que ela não enxerga, e o administrador a uma
 * ação que só o veterinário pode fazer. Vazio que aponta para porta fechada é
 * pior do que vazio mudo.
 *
 * Só a segunda metade: o título do `Vazio` já diz que não há receita, e
 * repetir a constatação antes do conselho fazia a tela dizer "Nenhuma receita
 * ainda. Nenhuma receita ainda. Quem prescreve é…".
 */
function vazio(papel: Papel | null): string {
  switch (papel) {
    case 'VETERINARIO':
      return 'Comece por “Nova receita”.';
    case 'FARMACIA':
      return 'Elas aparecem aqui quando um veterinário emitir.';
    default:
      // "Pela ficha do tutor" não: o botão de prescrever também está atrás de
      // `podePrescrever` lá, então o administrador iria olhar e não acharia.
      return 'Quem prescreve é o veterinário, com a conta dele.';
  }
}

/** Como cada situação aparece. O texto carrega o sentido; a cor reforça. */
const APARENCIA: Record<Resumida['situacao'], { tom: TomDoSelo; rotulo: string }> = {
  rascunho: { tom: 'neutro', rotulo: 'rascunho' },
  valida: { tom: 'sucesso', rotulo: 'válida' },
  vencida: { tom: 'antimicrobiano', rotulo: 'vencida' },
  cancelada: { tom: 'controlado', rotulo: 'cancelada' },
};

export function Receitas() {
  const carregar = useCallback(() => exigir(api.GET('/api/v1/receituario/receitas')), []);
  const { estado, recarregar } = useConsulta('receitas', carregar);
  const papel = usePapel();
  const podePrescrever = usePodePrescrever();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Receitas</h1>
        {/*
          O caminho para prescrever começava só dentro da ficha de um tutor:
          quem abria "Receitas" para escrever uma não tinha por onde. Agora
          começa aqui, e o wizard pergunta o tutor no primeiro passo.
        */}
        {podePrescrever ? (
          <Link to="/receitas/nova" className={aparenciaDeBotao()}>
            Nova receita
          </Link>
        ) : null}
      </div>

      {estado.situacao === 'carregando' ? <Carregando o="receitas" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} aoTentar={recarregar} /> : null}

      {estado.situacao === 'ok' ? (
        estado.dado.receitas.length === 0 ? (
          <Vazio icone="receita" titulo="Nenhuma receita ainda">
            {vazio(papel)}
          </Vazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {estado.dado.receitas.map((r) => (
              <li key={r.id}>
                <Linha receita={r} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function Linha({ receita }: { receita: Resumida }) {
  const aparencia = APARENCIA[receita.situacao];

  return (
    <Link
      to={`/receitas/${receita.id}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-neutro-200 bg-neutro-0 px-4 py-3 hover:bg-neutro-100"
    >
      <span className="font-mono text-sm text-neutro-500">
        {receita.numero === null ? '—' : `nº ${receita.numero}`}
      </span>
      <span className="font-semibold text-neutro-900">{receita.pacienteNome}</span>
      <span className="text-sm text-neutro-500">{receita.tutorNome}</span>
      <Selo tom={aparencia.tom}>{aparencia.rotulo}</Selo>

      {receita.validaAte && receita.situacao === 'valida' ? (
        <span className="text-sm text-neutro-500">
          até {new Date(receita.validaAte).toLocaleDateString('pt-BR')}
        </span>
      ) : null}

      <span className="ml-auto text-sm text-neutro-500">
        {new Date(receita.criadaEm).toLocaleDateString('pt-BR')}
      </span>
    </Link>
  );
}
