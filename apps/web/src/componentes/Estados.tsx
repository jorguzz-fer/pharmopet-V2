import type { ReactNode } from 'react';
import { Botao } from '@/componentes/Botao';
import { Icone, type NomeDoIcone } from '@/componentes/Icone';

/**
 * Os três estados de uma tela que carrega dados.
 *
 * Ficam juntos num arquivo porque são a mesma decisão: se cada tela escrever o
 * seu "carregando", metade vai esquecer o `aria-live` e a outra metade vai
 * confundir lista vazia com resposta ainda a caminho.
 */

export type PropsDeCarregando = {
  o?: string;
  /**
   * Quantas linhas de esqueleto desenhar. `0` mantém só a frase — para quando
   * o que vem não é lista, e um esqueleto de lista mentiria sobre o formato.
   */
  linhas?: number;
};

/**
 * Esperando resposta.
 *
 * Desenha a forma da lista antes dos dados, em vez de uma frase centralizada:
 * a página para de pular quando eles chegam, e quem espera já sabe se vem
 * uma linha ou vinte. A frase continua existindo — invisível, para o leitor
 * de tela, que não tem o que fazer com retângulo cinza.
 */
export function Carregando({ o = 'dados', linhas = 3 }: PropsDeCarregando) {
  if (linhas <= 0) {
    // `polite` e não `assertive`: o leitor de tela avisa quando terminar a
    // frase atual, em vez de cortar quem está lendo outra coisa.
    return (
      <p aria-live="polite" className="py-8 text-center text-sm text-neutro-500">
        Carregando {o}…
      </p>
    );
  }

  return (
    <div aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando {o}…</span>
      {/* `animate-pulse` respeita `prefers-reduced-motion` pela regra global
          do `global.css`, que zera a duração de toda animação. */}
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-3 py-2">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 w-11 shrink-0 rounded-pill bg-neutro-100" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="h-3 rounded-pill bg-neutro-100" style={{ width: `${48 + i * 7}%` }} />
              <div
                className="h-2.5 rounded-pill bg-neutro-50"
                style={{ width: `${32 + i * 5}%` }}
              />
            </div>
            <div className="h-3 w-16 shrink-0 rounded-pill bg-neutro-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export type PropsDeFalha = {
  motivo: string;
  aoTentar?: () => void;
  /** O que a pessoa deveria entender que aconteceu, acima do motivo técnico. */
  titulo?: string;
};

export function Falha({ motivo, aoTentar, titulo = 'Não deu para carregar' }: PropsDeFalha) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-card border border-controlado-borda bg-controlado-fundo px-4 py-4"
    >
      <Icone nome="alerta" tamanho={20} className="mt-0.5 text-controlado-texto" />
      <div className="flex flex-col items-start gap-3">
        <div>
          <p className="font-titulo text-base font-bold text-controlado-texto">{titulo}</p>
          <p className="mt-0.5 text-sm text-controlado-texto">{motivo}</p>
        </div>
        {aoTentar ? (
          <Botao tom="secundario" onClick={aoTentar}>
            <Icone nome="recarregar" tamanho={16} />
            Tentar de novo
          </Botao>
        ) : null}
      </div>
    </div>
  );
}

export type PropsDeVazio = {
  /** A frase que explica o vazio. Continua sendo o que a maioria das telas passa. */
  children: ReactNode;
  /** Uma linha em negrito acima da frase, quando ela sozinha não basta. */
  titulo?: string;
  /** Reforço visual. Sem ele o vazio é só texto, que é o que era antes. */
  icone?: NomeDoIcone;
  /** O caminho para sair do vazio — um botão, um link. */
  acao?: ReactNode;
};

/**
 * Lista sem resultado.
 *
 * Diz o que fazer, e não só que não há nada: "nenhum tutor" deixa a pessoa
 * parada, "nenhum tutor com esse nome — cadastre" não.
 *
 * `titulo`, `icone` e `acao` são opcionais porque a maioria das listas vazias
 * é uma linha dentro de um cartão que já tem título, e ali um desenho de 52px
 * seria mais barulho que informação. Valem a pena quando o vazio ocupa a
 * página inteira — foi o caso da fila da farmácia, que era uma frase cinza
 * solta no meio de uma tela em branco.
 */
export function Vazio({ children, titulo, icone, acao }: PropsDeVazio) {
  if (!titulo && !icone && !acao) {
    return <p className="py-8 text-center text-sm text-neutro-500">{children}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icone ? (
        <span className="grid size-13 place-items-center rounded-pill bg-neutro-100 text-neutro-500">
          <Icone nome={icone} tamanho={24} />
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        {titulo ? (
          <p className="font-titulo text-base font-bold text-neutro-900">{titulo}</p>
        ) : null}
        <p className="max-w-prose text-sm text-neutro-500">{children}</p>
      </div>
      {acao}
    </div>
  );
}
