export type PropsDaMarca = {
  /** Sobre fundo escuro a marca usa a escala clara, senão some no turquesa. */
  sobreEscuro?: boolean;
};

/**
 * Assinatura da PharmoPet: a gota com as duas patinhas, e o nome em duas cores.
 *
 * O desenho é SVG inline em vez de imagem porque precisa herdar a cor conforme
 * o fundo, e porque um logo de header não deveria custar uma requisição.
 */
export function Marca({ sobreEscuro = false }: PropsDaMarca) {
  const turquesa = sobreEscuro ? 'var(--color-sobre-escuro-marca)' : 'var(--color-turquesa-500)';
  const lilas = sobreEscuro
    ? 'var(--color-sobre-escuro-marca-secundaria)'
    : 'var(--color-lilas-400)';

  return (
    <span className="inline-flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" role="img" aria-label="PharmoPet">
        <path
          d="M12 2.5c3.6 4 6.5 7 6.5 10.4A6.5 6.5 0 0 1 12 19.4a6.5 6.5 0 0 1-6.5-6.5C5.5 9.5 8.4 6.5 12 2.5z"
          stroke={turquesa}
          strokeWidth="1.8"
        />
        <circle cx="10" cy="12.5" r="1.9" fill={lilas} />
        <circle cx="14.2" cy="12.5" r="1.9" fill={lilas} />
      </svg>
      <span className="font-titulo text-lg font-extrabold tracking-tight">
        <span style={{ color: turquesa }}>PHARMO</span> <span style={{ color: lilas }}>PET</span>
      </span>
    </span>
  );
}
