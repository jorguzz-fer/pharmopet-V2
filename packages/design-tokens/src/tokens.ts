/**
 * Tokens de design da PharmoPet.
 *
 * A paleta deriva da própria logo: o turquesa e o lilás foram extraídos dela,
 * não escolhidos à parte. A v1 usava um verde genérico de framework, de modo
 * que a interface nunca combinou com a identidade — esta é a correção.
 *
 * Fonte única para web e, no futuro, mobile. Nada de hex solto em componente.
 */

export const cor = {
  /** Turquesa da marca. 500 é a cor da logo; 700 é a que passa contraste como ação. */
  turquesa: {
    50: '#E8F7F6',
    100: '#C9EDEB',
    500: '#1EB4AE',
    700: '#0B6F6A',
    900: '#0A4F4C',
  },
  /** Lilás da marca, usado em contexto de paciente e em marcação secundária. */
  lilas: {
    50: '#F2F0F8',
    100: '#E2DDEE',
    400: '#9C90BA',
    700: '#61548A',
  },
  /**
   * Neutros com viés levemente frio, para assentar sobre o turquesa.
   *
   * Do 500 para baixo (números maiores) é texto; 300 e acima é borda, divisor
   * e controle desabilitado — nunca texto, porque não alcançam contraste AA.
   */
  neutro: {
    0: '#FFFFFF',
    50: '#F7FAFA',
    100: '#EEF3F3',
    200: '#DFE7E7',
    300: '#C6D2D2',
    500: '#5E6D6C',
    700: '#3E4B4A',
    900: '#17211F',
  },
  /**
   * Escala para uso sobre o turquesa escuro (painel de login, topo da receita
   * do tutor). Fundo de referência: turquesa 900.
   */
  sobreEscuro: {
    marca: '#4ED8D1',
    marcaSecundaria: '#C3B9DC',
    texto: '#B4DEDB',
    fundoElevado: '#0E605C',
  },
} as const;

/**
 * Cores semânticas. Separadas da marca de propósito: estado nunca disputa
 * atenção com identidade.
 *
 * `controlado` sinaliza exigência legal (receituário específico e retenção de
 * via) e por isso nunca aparece só como cor — sempre com ícone e texto.
 */
export const estado = {
  controlado: { texto: '#8E1D17', base: '#B3261E', fundo: '#FDECEA', borda: '#F3C9C5' },
  antimicrobiano: { texto: '#7A4F00', base: '#8A5A00', fundo: '#FDF3DF', borda: '#EAD6A3' },
  sucesso: { texto: '#0B5C37', base: '#0F7A4A', fundo: '#E4F4EC', borda: '#B6DEC9' },
} as const;

export const fonte = {
  /** Títulos. Geométrica, ecoa a redondeza da logo. */
  titulo: "'Manrope', system-ui, sans-serif",
  /** Corpo e interface. Desenhada para densidade de dado técnico. */
  corpo: "'IBM Plex Sans', system-ui, sans-serif",
  /** Preço, dose e código. Numeral tabular alinha coluna. */
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const tamanhoFonte = {
  micro: '11.5px',
  xs: '12.5px',
  sm: '13px',
  base: '15px',
  lg: '19px',
  xl: '24px',
  '2xl': '28px',
  '3xl': '32px',
} as const;

/** Escala de 4px. Usar `gap` em flex/grid, não margem por elemento. */
export const espaco = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
  12: '48px',
  16: '64px',
} as const;

export const raio = {
  controle: '9px',
  card: '12px',
  pill: '999px',
} as const;

/**
 * Altura mínima de qualquer elemento acionável. 44px é o piso de alvo de
 * toque — o veterinário usa isso com pressa, às vezes no celular.
 */
export const alturaControle = '44px';

export const tokens = {
  cor,
  estado,
  fonte,
  tamanhoFonte,
  espaco,
  raio,
  alturaControle,
} as const;

export type Tokens = typeof tokens;
