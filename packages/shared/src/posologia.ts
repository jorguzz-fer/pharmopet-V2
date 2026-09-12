import { z } from 'zod';

/**
 * Cálculo de posologia de formulação magistral.
 *
 * Portado do sistema anterior, onde foi conferido contra a planilha de
 * referência da PharmoPet (`CALCULADORA_POSOLOGIA.xlsx`):
 *
 *   dose_g       = unidade === 'g' ? valor : valor / 1000
 *   doses_dia    = 24 / frequência_horas
 *   quantidade   = dias × doses_dia
 *   total_gramas = dose_g × quantidade
 *
 * A posologia vale para a formulação inteira, não por princípio ativo: todos
 * compõem a mesma cápsula/dose, então a contagem de doses é necessariamente
 * única. O total em gramas é o que alimenta a precificação por insumo.
 */

/** Intervalos aceitos, em horas. Fora desta lista o cálculo é recusado. */
export const FREQUENCIAS_HORAS = [24, 12, 8, 6] as const;
export type FrequenciaHoras = (typeof FREQUENCIAS_HORAS)[number];

export const unidadeDoseSchema = z.enum(['mg', 'g']);
export type UnidadeDose = z.infer<typeof unidadeDoseSchema>;

export const posologiaSchema = z.object({
  /** Dose por administração, na unidade informada */
  dose: z.number().positive(),
  unidade: unidadeDoseSchema,
  /** Intervalo entre administrações, em horas */
  frequenciaHoras: z.union([z.literal(24), z.literal(12), z.literal(8), z.literal(6)]),
  /** Duração do tratamento, em dias inteiros */
  dias: z.number().int().positive(),
});

export type Posologia = z.infer<typeof posologiaSchema>;

export interface PosologiaCalculada {
  /** Administrações por dia (24h→1, 12h→2, 8h→3, 6h→4) */
  dosesPorDia: number;
  /** Total de unidades a manipular (cápsulas, biscoitos, doses) */
  quantidade: number;
  /** Dose por administração convertida para gramas */
  doseEmGramas: number;
  /** Massa total do princípio ativo na formulação, em gramas */
  totalGramas: number;
}

/**
 * Quantas unidades manipular para cobrir o tratamento.
 *
 * Não depende da dose — depende de quantas vezes por dia e por quantos dias.
 * Separada para quem só precisa disso não ter que inventar uma dose para
 * chamar `calcularPosologia`.
 */
export function quantidadeDeDoses(frequenciaHoras: FrequenciaHoras, dias: number): number {
  return dias * (24 / frequenciaHoras);
}

/** Converte a dose informada para gramas, que é a unidade do cálculo. */
export function doseEmGramas(dose: number, unidade: UnidadeDose): number {
  return unidade === 'g' ? dose : dose / 1000;
}

/**
 * Calcula quantidade e massa total a partir da posologia.
 *
 * @throws {z.ZodError} se a posologia for inválida — o cálculo nunca adivinha.
 */
export function calcularPosologia(entrada: Posologia): PosologiaCalculada {
  const { dose, unidade, frequenciaHoras, dias } = posologiaSchema.parse(entrada);

  const dosesPorDia = 24 / frequenciaHoras;
  const quantidade = quantidadeDeDoses(frequenciaHoras, dias);
  const emGramas = doseEmGramas(dose, unidade);

  return {
    dosesPorDia,
    quantidade,
    doseEmGramas: emGramas,
    totalGramas: emGramas * quantidade,
  };
}
