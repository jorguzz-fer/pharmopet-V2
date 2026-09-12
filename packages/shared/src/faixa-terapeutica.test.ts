import { describe, expect, it } from 'vitest';
import {
  conferirDose,
  descreverConferencia,
  faixaAplicavel,
  type FaixaTerapeutica,
} from './faixa-terapeutica.js';

/** Gabapentina em cão: 10 a 20 mg/kg. */
const CANINO: FaixaTerapeutica = {
  especie: 'CANINO',
  pesoMinimoEmGramas: null,
  pesoMaximoEmGramas: null,
  doseMinimaEmMicrogramasPorKg: 10_000,
  doseMaximaEmMicrogramasPorKg: 20_000,
  duracaoMaximaEmDias: null,
};

/** Em gato a faixa é outra: 5 a 10 mg/kg. */
const FELINO: FaixaTerapeutica = {
  ...CANINO,
  especie: 'FELINO',
  doseMinimaEmMicrogramasPorKg: 5_000,
  doseMaximaEmMicrogramasPorKg: 10_000,
};

describe('faixaAplicavel', () => {
  /**
   * O erro que este cadastro existe para impedir: dosar gato pela tabela de
   * cachorro. Se a espécie não fosse filtrada, a faixa do cão passaria, e uma
   * dose de 15 mg/kg — normal em cão — apareceria como correta num felino.
   */
  it('não usa a faixa de outra espécie', () => {
    const escolhida = faixaAplicavel([CANINO, FELINO], { especie: 'FELINO', pesoEmGramas: 4_200 });

    expect(escolhida).toBe(FELINO);
  });

  it('devolve nulo quando não há faixa para a espécie', () => {
    expect(faixaAplicavel([CANINO], { especie: 'EQUINO', pesoEmGramas: 450_000 })).toBeNull();
  });

  it('respeita os limites de peso da faixa', () => {
    const filhote: FaixaTerapeutica = { ...CANINO, pesoMaximoEmGramas: 5_000 };

    expect(faixaAplicavel([filhote], { especie: 'CANINO', pesoEmGramas: 4_000 })).toBe(filhote);
    expect(faixaAplicavel([filhote], { especie: 'CANINO', pesoEmGramas: 6_000 })).toBeNull();
  });

  it('inclui os extremos da faixa de peso', () => {
    const faixa: FaixaTerapeutica = {
      ...CANINO,
      pesoMinimoEmGramas: 2_000,
      pesoMaximoEmGramas: 5_000,
    };

    expect(faixaAplicavel([faixa], { especie: 'CANINO', pesoEmGramas: 2_000 })).toBe(faixa);
    expect(faixaAplicavel([faixa], { especie: 'CANINO', pesoEmGramas: 5_000 })).toBe(faixa);
  });

  /**
   * Com cadastro sobreposto, a faixa estreita foi escrita pensando naquele
   * porte; a aberta é o padrão de quem não achou nada melhor.
   */
  it('prefere a faixa mais específica quando duas servem', () => {
    const especifica: FaixaTerapeutica = {
      ...CANINO,
      pesoMinimoEmGramas: 2_000,
      pesoMaximoEmGramas: 10_000,
      doseMaximaEmMicrogramasPorKg: 15_000,
    };

    expect(faixaAplicavel([CANINO, especifica], { especie: 'CANINO', pesoEmGramas: 5_000 })).toBe(
      especifica,
    );
    expect(faixaAplicavel([especifica, CANINO], { especie: 'CANINO', pesoEmGramas: 5_000 })).toBe(
      especifica,
    );
  });
});

describe('conferirDose', () => {
  const gato = { especie: 'FELINO' as const, pesoEmGramas: 4_000 };

  it('aceita a dose dentro da faixa', () => {
    // 4 kg × 7,5 mg/kg = 30 mg
    const resultado = conferirDose([FELINO], gato, 30_000);

    expect(resultado).toEqual({ situacao: 'dentro', doseEmMicrogramasPorKg: 7_500 });
  });

  it('aponta dose acima do máximo, com o limite', () => {
    // 4 kg × 15 mg/kg = 60 mg — normal em cão, demais em gato
    const resultado = conferirDose([FELINO], gato, 60_000);

    expect(resultado).toEqual({
      situacao: 'acima',
      doseEmMicrogramasPorKg: 15_000,
      limiteEmMicrogramasPorKg: 10_000,
    });
  });

  it('aponta dose abaixo do mínimo', () => {
    const resultado = conferirDose([FELINO], gato, 8_000);

    expect(resultado).toMatchObject({ situacao: 'abaixo', limiteEmMicrogramasPorKg: 5_000 });
  });

  it('aceita os extremos da faixa', () => {
    expect(conferirDose([FELINO], gato, 20_000).situacao).toBe('dentro');
    expect(conferirDose([FELINO], gato, 40_000).situacao).toBe('dentro');
  });

  it('diz que não sabe, em vez de aprovar, quando não há faixa cadastrada', () => {
    expect(conferirDose([], gato, 30_000)).toEqual({ situacao: 'sem-referencia' });
  });

  /** Dividir por zero devolveria Infinity e a conferência aprovaria qualquer coisa. */
  it('não conclui nada sobre peso zerado', () => {
    expect(conferirDose([FELINO], { especie: 'FELINO', pesoEmGramas: 0 }, 30_000)).toEqual({
      situacao: 'sem-referencia',
    });
  });

  it('funciona em paciente muito leve, sem perder a fração', () => {
    // Calopsita de 90 g com 0,9 mg → 10 mg/kg
    const faixaAve: FaixaTerapeutica = { ...CANINO, especie: 'AVE' };
    const resultado = conferirDose([faixaAve], { especie: 'AVE', pesoEmGramas: 90 }, 900);

    expect(resultado).toMatchObject({ situacao: 'dentro', doseEmMicrogramasPorKg: 10_000 });
  });
});

describe('descreverConferencia', () => {
  it('não diz nada quando a dose está certa', () => {
    expect(
      descreverConferencia({ situacao: 'dentro', doseEmMicrogramasPorKg: 7_500 }, 'Gabapentina'),
    ).toBeNull();
  });

  it('diz o valor e o limite, em mg/kg', () => {
    const frase = descreverConferencia(
      { situacao: 'acima', doseEmMicrogramasPorKg: 15_000, limiteEmMicrogramasPorKg: 10_000 },
      'Gabapentina',
    );

    expect(frase).toBe('Gabapentina está em 15 mg/kg, acima do máximo de 10 mg/kg.');
  });

  it('mostra fração de miligrama com vírgula', () => {
    const frase = descreverConferencia(
      { situacao: 'abaixo', doseEmMicrogramasPorKg: 2_500, limiteEmMicrogramasPorKg: 5_000 },
      'Tramadol',
    );

    expect(frase).toContain('2,5 mg/kg');
  });

  it('pede conferência quando não há referência, em vez de silenciar', () => {
    expect(descreverConferencia({ situacao: 'sem-referencia' }, 'Gabapentina')).toContain(
      'Confira a dose',
    );
  });
});
