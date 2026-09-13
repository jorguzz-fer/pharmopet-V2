import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type TomDoBotao = 'primario' | 'secundario' | 'perigo';

/**
 * Botão do sistema.
 *
 * Encapsula a base visual: nenhuma tela escolhe cor ou altura na mão, então
 * trocar o visual depois não vira caçada a classe espalhada.
 *
 * A altura mínima vem do token de alvo de toque. A tela é usada com pressa,
 * às vezes no celular com o animal na mesa — alvo pequeno aqui custa erro.
 */
const porTom: Record<TomDoBotao, string> = {
  primario: 'bg-turquesa-700 text-neutro-0 hover:bg-turquesa-900',
  secundario: 'bg-neutro-0 text-neutro-700 border border-neutro-200 hover:bg-neutro-100',
  perigo:
    'bg-neutro-0 text-controlado-texto border border-controlado-borda hover:bg-controlado-fundo',
};

export type PropsDoBotao = ButtonHTMLAttributes<HTMLButtonElement> & {
  tom?: TomDoBotao;
  /** Ocupa toda a largura disponível. Padrão no mobile, exceção no desktop. */
  larguraTotal?: boolean;
  children: ReactNode;
};

/**
 * A aparência do botão, para quem **não** é um botão.
 *
 * Existe por causa de um erro que estava em duas telas: `<Link><Botao/></Link>`
 * põe um `<button>` dentro de um `<a>`, o que o HTML não permite. O navegador
 * remenda como quiser, o leitor de tela anuncia "botão" onde há um link — a
 * pessoa não sabe que vai mudar de página — e o teclado para duas vezes no
 * mesmo alvo. Quem navega usa `<Link className={aparenciaDeBotao()}>`, que é
 * um link de verdade com cara de botão.
 */
export function aparenciaDeBotao({
  tom = 'primario',
  larguraTotal = false,
}: { tom?: TomDoBotao; larguraTotal?: boolean } = {}): string {
  return [
    'inline-flex min-h-[var(--altura-controle)] items-center justify-center gap-2',
    'rounded-controle px-4 text-base font-semibold',
    'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    porTom[tom],
    larguraTotal ? 'w-full' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function Botao({
  tom = 'primario',
  larguraTotal = false,
  className = '',
  type = 'button',
  children,
  ...resto
}: PropsDoBotao) {
  return (
    <button
      // Sem `type` explícito o botão vira submit dentro de form e dispara
      // envio sem querer. O padrão aqui é o inofensivo.
      type={type}
      className={[aparenciaDeBotao({ tom, larguraTotal }), className].filter(Boolean).join(' ')}
      {...resto}
    >
      {children}
    </button>
  );
}
