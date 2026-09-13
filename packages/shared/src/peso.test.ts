import { describe, expect, it } from 'vitest';
import { PESO_MAXIMO_EM_GRAMAS, formatarPeso, lerPesoEmQuilos, pesoParaCampo } from './peso.js';

describe('lerPesoEmQuilos', () => {
  it('aceita vírgula e ponto pela mesma conta', () => {
    expect(lerPesoEmQuilos('12,5')).toEqual({ valido: true, emGramas: 12_500 });
    expect(lerPesoEmQuilos('12.5')).toEqual({ valido: true, emGramas: 12_500 });
  });

  it('aceita inteiro', () => {
    expect(lerPesoEmQuilos('30')).toEqual({ valido: true, emGramas: 30_000 });
  });

  it('aceita espaço em volta, que o copiar e colar deixa', () => {
    expect(lerPesoEmQuilos('  4,2  ')).toEqual({ valido: true, emGramas: 4_200 });
  });

  /**
   * O caso que obriga o arredondamento: 12.5 × 1000 dá 12500.000000000002 em
   * ponto flutuante, e truncar devolveria 12499 — um grama a menos, sem
   * ninguém perceber.
   */
  it('não perde um grama para o ponto flutuante', () => {
    expect(lerPesoEmQuilos('12,5')).toEqual({ valido: true, emGramas: 12_500 });
    expect(lerPesoEmQuilos('0,29')).toEqual({ valido: true, emGramas: 290 });
    expect(lerPesoEmQuilos('1,1')).toEqual({ valido: true, emGramas: 1_100 });
  });

  it('aceita o peso de uma ave, em fração de quilo', () => {
    expect(lerPesoEmQuilos('0,045')).toEqual({ valido: true, emGramas: 45 });
  });

  /** `Number('1e3')` daria 1000 calado. */
  it('recusa notação científica', () => {
    expect(lerPesoEmQuilos('1e3')).toMatchObject({ valido: false });
  });

  it.each(['', '   ', 'abc', '12kg', '-5', '1,2,3', '+4'])('recusa %o', (entrada) => {
    expect(lerPesoEmQuilos(entrada)).toMatchObject({ valido: false });
  });

  it('recusa zero', () => {
    expect(lerPesoEmQuilos('0')).toMatchObject({ valido: false });
    expect(lerPesoEmQuilos('0,0')).toMatchObject({ valido: false });
  });

  /**
   * Alguém digitando gramas no campo de quilo: "500" viraria meia tonelada.
   * O teto pega isso antes de virar dose.
   */
  it('recusa peso fora da escala que a farmácia atende', () => {
    expect(lerPesoEmQuilos('2001')).toMatchObject({ valido: false });
    expect(lerPesoEmQuilos(String(PESO_MAXIMO_EM_GRAMAS))).toMatchObject({ valido: false });
  });

  it('aceita exatamente o teto', () => {
    expect(lerPesoEmQuilos('2000')).toEqual({ valido: true, emGramas: PESO_MAXIMO_EM_GRAMAS });
  });

  /** Abaixo de um grama nenhuma balança de clínica chega. */
  it('recusa o que arredondaria para zero grama', () => {
    expect(lerPesoEmQuilos('0,0004')).toMatchObject({ valido: false });
  });

  it('devolve um motivo legível em cada recusa', () => {
    const recusa = lerPesoEmQuilos('abc');

    expect(recusa.valido).toBe(false);
    if (!recusa.valido) expect(recusa.motivo).toEqual(expect.any(String));
  });
});

describe('formatarPeso', () => {
  it('mostra grama abaixo de um quilo', () => {
    expect(formatarPeso(450)).toBe('450 g');
    expect(formatarPeso(45)).toBe('45 g');
    expect(formatarPeso(999)).toBe('999 g');
  });

  it('mostra quilo a partir de um quilo', () => {
    expect(formatarPeso(1_000)).toBe('1 kg');
    expect(formatarPeso(30_000)).toBe('30 kg');
  });

  it('mostra a fração com vírgula', () => {
    expect(formatarPeso(12_500)).toBe('12,5 kg');
    expect(formatarPeso(4_200)).toBe('4,2 kg');
  });

  it('não esconde grama quando a fração é fina', () => {
    expect(formatarPeso(12_530)).toBe('12,53 kg');
  });
});

describe('pesoParaCampo', () => {
  it('devolve quilo com vírgula, sem unidade', () => {
    expect(pesoParaCampo(12_500)).toBe('12,5');
    expect(pesoParaCampo(30_000)).toBe('30');
    expect(pesoParaCampo(450)).toBe('0,45');
  });

  /** O que sai do campo precisa voltar igual ao entrar. */
  it('fecha o ciclo com lerPesoEmQuilos', () => {
    for (const gramas of [45, 450, 1_000, 4_200, 12_500, 12_530, 30_000, 2_000_000]) {
      expect(lerPesoEmQuilos(pesoParaCampo(gramas))).toEqual({ valido: true, emGramas: gramas });
    }
  });
});
