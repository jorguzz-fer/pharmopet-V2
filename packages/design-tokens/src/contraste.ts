/**
 * Contraste WCAG 2.1 entre duas cores.
 *
 * Existe para que acessibilidade seja verificável e não uma intenção: os pares
 * de cor que a interface realmente usa são testados, e o build reprova se
 * algum cair abaixo do mínimo.
 */

function canalLinear(valor: number): number {
  const v = valor / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Aceita `#RGB` ou `#RRGGBB`. */
export function paraRgb(hex: string): { r: number; g: number; b: number } {
  const limpo = hex.replace('#', '').trim();

  const expandido =
    limpo.length === 3
      ? limpo
          .split('')
          .map((c) => c + c)
          .join('')
      : limpo;

  if (!/^[0-9a-fA-F]{6}$/.test(expandido)) {
    throw new Error(`Cor hexadecimal inválida: ${hex}`);
  }

  return {
    r: parseInt(expandido.slice(0, 2), 16),
    g: parseInt(expandido.slice(2, 4), 16),
    b: parseInt(expandido.slice(4, 6), 16),
  };
}

/** Luminância relativa, conforme a definição da WCAG. */
export function luminancia(hex: string): number {
  const { r, g, b } = paraRgb(hex);
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}

/** Razão de contraste entre duas cores, de 1 (nenhum) a 21 (máximo). */
export function contraste(corA: string, corB: string): number {
  const a = luminancia(corA);
  const b = luminancia(corB);
  const clara = Math.max(a, b);
  const escura = Math.min(a, b);
  return (clara + 0.05) / (escura + 0.05);
}

/** Mínimos da WCAG 2.1 nível AA. */
export const MINIMO_AA_TEXTO = 4.5;
export const MINIMO_AA_TEXTO_GRANDE = 3;

export function atendeAA(corA: string, corB: string, textoGrande = false): boolean {
  return contraste(corA, corB) >= (textoGrande ? MINIMO_AA_TEXTO_GRANDE : MINIMO_AA_TEXTO);
}
