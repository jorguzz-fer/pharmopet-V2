import type { ReactNode } from 'react';

export type TomDoSelo = 'controlado' | 'antimicrobiano' | 'sucesso' | 'neutro' | 'marca';

const porTom: Record<TomDoSelo, string> = {
  controlado: 'bg-controlado-fundo text-controlado-texto border-controlado-borda',
  antimicrobiano: 'bg-antimicrobiano-fundo text-antimicrobiano-texto border-antimicrobiano-borda',
  sucesso: 'bg-sucesso-fundo text-sucesso-texto border-sucesso-borda',
  neutro: 'bg-neutro-100 text-neutro-700 border-neutro-200',
  marca: 'bg-lilas-50 text-lilas-700 border-lilas-100',
};

export type PropsDoSelo = {
  tom?: TomDoSelo;
  /** Ícone à esquerda do texto, como reforço. O texto é que carrega o sentido. */
  icone?: ReactNode;
  children: ReactNode;
};

/**
 * Marcação curta de estado ou categoria.
 *
 * `controlado` sinaliza exigência legal — receituário próprio e retenção da
 * via original. Por isso nunca aparece só como cor: quem não distingue
 * vermelho precisa ler a mesma informação no texto, e é o texto que carrega
 * o sentido. O ícone reforça; a cor é o último dos três sinais.
 */
export function Selo({ tom = 'neutro', icone, children }: PropsDoSelo) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5',
        'text-micro font-bold',
        porTom[tom],
      ].join(' ')}
    >
      {icone ? (
        <span aria-hidden="true" className="inline-flex">
          {icone}
        </span>
      ) : null}
      {children}
    </span>
  );
}
