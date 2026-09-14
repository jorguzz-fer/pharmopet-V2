import type { ReactNode } from 'react';

export type PropsDoCartao = {
  titulo?: ReactNode;
  /** Conteúdo alinhado à direita do título — contagem, ação, atalho. */
  acessorio?: ReactNode;
  /** Uma linha sob o título, para o que o título sozinho não diz. */
  descricao?: ReactNode;
  /**
   * Tira o respiro interno.
   *
   * Para quando o conteúdo é uma lista cujas linhas devem encostar nas bordas
   * e ter o próprio divisor — com `p-4` em volta, cada divisor fica flutuando
   * no meio do cartão sem tocar os lados.
   */
  semRespiro?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Superfície padrão do sistema.
 *
 * Existe para que "caixa branca" tenha um só valor de borda, raio, sombra e
 * respiro em toda a aplicação, em vez de cinco variações quase iguais.
 *
 * A sombra entrou depois: sem ela o cartão era branco com borda de 1px sobre
 * fundo quase branco, e nada dizia ao olho onde a superfície começava. A borda
 * continua, e não é redundante — a sombra some em tela de baixo contraste e
 * na impressão.
 */
export function Cartao({
  titulo,
  acessorio,
  descricao,
  semRespiro = false,
  children,
  className = '',
}: PropsDoCartao) {
  return (
    <section
      className={[
        'overflow-hidden rounded-card border border-neutro-200 bg-neutro-0 shadow-carta',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {titulo ? (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-neutro-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-titulo text-base font-bold text-neutro-900">{titulo}</h2>
            {descricao ? <p className="mt-0.5 text-xs text-neutro-500">{descricao}</p> : null}
          </div>
          {acessorio}
        </header>
      ) : null}
      <div className={semRespiro ? '' : 'p-4'}>{children}</div>
    </section>
  );
}
