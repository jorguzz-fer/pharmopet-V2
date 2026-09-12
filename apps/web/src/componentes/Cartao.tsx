import type { ReactNode } from 'react';

export type PropsDoCartao = {
  titulo?: ReactNode;
  /** Conteúdo alinhado à direita do título — contagem, ação, atalho. */
  acessorio?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Superfície padrão do sistema.
 *
 * Existe para que "caixa branca com borda" tenha um só valor de borda, raio e
 * respiro em toda a aplicação, em vez de cinco variações quase iguais.
 */
export function Cartao({ titulo, acessorio, children, className = '' }: PropsDoCartao) {
  return (
    <section
      className={['rounded-card border border-neutro-200 bg-neutro-0', className]
        .filter(Boolean)
        .join(' ')}
    >
      {titulo ? (
        <header className="flex items-center justify-between gap-4 border-b border-neutro-100 px-4 py-3">
          <h2 className="font-titulo text-base font-bold text-neutro-900">{titulo}</h2>
          {acessorio}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
