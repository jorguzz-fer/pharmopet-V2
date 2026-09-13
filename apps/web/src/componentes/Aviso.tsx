import type { ReactNode } from 'react';

export type TomDoAviso = 'impedimento' | 'atencao' | 'informacao';

const porTom: Record<TomDoAviso, string> = {
  impedimento: 'border-controlado-borda bg-controlado-fundo text-controlado-texto',
  atencao: 'border-antimicrobiano-borda bg-antimicrobiano-fundo text-antimicrobiano-texto',
  informacao: 'border-neutro-200 bg-neutro-100 text-neutro-700',
};

const rotulo: Record<TomDoAviso, string> = {
  impedimento: 'Impedimento',
  atencao: 'Atenção',
  informacao: 'Nota',
};

/**
 * Recado da API para quem prescreve.
 *
 * Três tons, e a diferença é de consequência, não de cor:
 *
 * - **impedimento** — a farmácia não manipula assim. A receita não sai.
 * - **atenção** — dose fora da faixa, estoque, controlado. Sai, mas quem
 *   assina precisa ter visto.
 * - **informação** — o resto.
 *
 * O tom aparece escrito, e não só na cor: quem não distingue vermelho de
 * amarelo precisa ler a mesma diferença. Em tela de prescrição isso não é
 * detalhe de acessibilidade, é a diferença entre parar e seguir.
 */
export function Aviso({ tom = 'informacao', children }: { tom?: TomDoAviso; children: ReactNode }) {
  return (
    <p
      // `alert` só no impedimento: o leitor de tela interrompe o que está
      // lendo, e interromper a cada aviso de dose deixaria a tela impossível.
      role={tom === 'impedimento' ? 'alert' : 'status'}
      className={['flex gap-2 rounded-controle border px-3 py-2 text-sm', porTom[tom]].join(' ')}
    >
      <strong className="shrink-0 font-bold">{rotulo[tom]}:</strong>
      <span>{children}</span>
    </p>
  );
}

/** O tipo de aviso que a API manda, traduzido para o tom da tela. */
export function tomDoAviso(tipo: string): TomDoAviso {
  // "sem-referencia" é ausência de cadastro, não erro de quem prescreve — mas
  // continua sendo algo a conferir antes de assinar.
  return tipo === 'sem-estoque' ? 'informacao' : 'atencao';
}
