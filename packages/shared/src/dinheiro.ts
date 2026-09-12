/**
 * Dinheiro em inteiro.
 *
 * Nada de `number` para valor monetário. O sistema anterior somava preços em
 * ponto flutuante e arredondava a cada ingrediente; o erro é pequeno numa
 * fórmula e deixa de ser pequeno num fechamento de mês.
 *
 * Duas escalas, e a distinção importa:
 *
 * - **centavo** — o que a pessoa paga. É o que entra no banco e sai na API.
 * - **micro-real** (10⁻⁶ BRL) — o que aparece no meio da conta. O custo de um
 *   insumo é da ordem de R$ 0,035 por grama, e uma fórmula usa fração de grama:
 *   arredondar isso a centavo antes de multiplicar jogaria fora a maior parte
 *   do valor.
 *
 * A conta inteira roda em `bigint` e só vira centavo no fim, uma vez.
 */

/** Quantos micro-reais cabem num centavo. */
export const MICRO_POR_CENTAVO = 10_000n;

/** Quantos micro-reais cabem num real. */
export const MICRO_POR_REAL = 1_000_000n;

export function centavosParaMicro(centavos: number): bigint {
  return BigInt(Math.trunc(centavos)) * MICRO_POR_CENTAVO;
}

/**
 * Converte micro-reais para centavos, arredondando meio para cima.
 *
 * Meio para cima, e não truncamento, porque truncar sempre favorece o mesmo
 * lado: a farmácia perderia uma fração de centavo em cada fórmula, todo dia.
 * Negativos arredondam pelo módulo, para que -0,5 e +0,5 se comportem igual.
 */
export function microParaCentavos(micro: bigint): number {
  const sinal = micro < 0n ? -1n : 1n;
  const absoluto = micro * sinal;
  const arredondado = (absoluto + MICRO_POR_CENTAVO / 2n) / MICRO_POR_CENTAVO;

  return Number(arredondado * sinal);
}

/** Formata centavos como moeda brasileira. Só para exibição e mensagem. */
export function formatarReais(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    centavos / 100,
  );
}
