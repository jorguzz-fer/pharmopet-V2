import { describe, it, expect } from 'vitest';
import { calcularPosologia, doseEmGramas } from './posologia.js';

describe('calcularPosologia', () => {
  /**
   * Caso de referência da planilha da PharmoPet: Benzafibrato 25mg, 8/8h,
   * 30 dias. A planilha chega a 2,250 g de princípio ativo.
   */
  it('reproduz o exemplo da planilha de referência', () => {
    const r = calcularPosologia({ dose: 25, unidade: 'mg', frequenciaHoras: 8, dias: 30 });

    expect(r.dosesPorDia).toBe(3);
    expect(r.quantidade).toBe(90);
    expect(r.doseEmGramas).toBeCloseTo(0.025, 6);
    expect(r.totalGramas).toBeCloseTo(2.25, 6);
  });

  /** Segundo exemplo da planilha: 34mg a cada 24h por 30 dias = 30 cápsulas. */
  it('reproduz o segundo exemplo de prescrição', () => {
    const r = calcularPosologia({ dose: 34, unidade: 'mg', frequenciaHoras: 24, dias: 30 });

    expect(r.quantidade).toBe(30);
    expect(r.totalGramas).toBeCloseTo(1.02, 6);
  });

  it.each([
    { frequenciaHoras: 24 as const, dosesPorDia: 1 },
    { frequenciaHoras: 12 as const, dosesPorDia: 2 },
    { frequenciaHoras: 8 as const, dosesPorDia: 3 },
    { frequenciaHoras: 6 as const, dosesPorDia: 4 },
  ])(
    'mapeia $frequenciaHoras h para $dosesPorDia doses por dia',
    ({ frequenciaHoras, dosesPorDia }) => {
      const r = calcularPosologia({ dose: 10, unidade: 'mg', frequenciaHoras, dias: 1 });
      expect(r.dosesPorDia).toBe(dosesPorDia);
      expect(r.quantidade).toBe(dosesPorDia);
    },
  );

  it('aceita dose já informada em gramas, sem converter', () => {
    const r = calcularPosologia({ dose: 0.5, unidade: 'g', frequenciaHoras: 24, dias: 10 });

    expect(r.doseEmGramas).toBe(0.5);
    expect(r.totalGramas).toBeCloseTo(5, 6);
  });

  it('recusa frequência fora dos intervalos aceitos', () => {
    expect(() =>
      // @ts-expect-error valida a guarda em runtime, não só o tipo
      calcularPosologia({ dose: 10, unidade: 'mg', frequenciaHoras: 7, dias: 30 }),
    ).toThrow();
  });

  it.each([
    {
      caso: 'dose zero',
      entrada: { dose: 0, unidade: 'mg' as const, frequenciaHoras: 8 as const, dias: 30 },
    },
    {
      caso: 'dose negativa',
      entrada: { dose: -5, unidade: 'mg' as const, frequenciaHoras: 8 as const, dias: 30 },
    },
    {
      caso: 'dias zero',
      entrada: { dose: 10, unidade: 'mg' as const, frequenciaHoras: 8 as const, dias: 0 },
    },
    {
      caso: 'dias fracionado',
      entrada: { dose: 10, unidade: 'mg' as const, frequenciaHoras: 8 as const, dias: 1.5 },
    },
  ])('recusa $caso em vez de adivinhar', ({ entrada }) => {
    expect(() => calcularPosologia(entrada)).toThrow();
  });
});

describe('doseEmGramas', () => {
  it('converte mg para g', () => {
    expect(doseEmGramas(250, 'mg')).toBeCloseTo(0.25, 6);
  });

  it('mantém g inalterado', () => {
    expect(doseEmGramas(1.5, 'g')).toBe(1.5);
  });
});
