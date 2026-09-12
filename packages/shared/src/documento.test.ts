import { describe, expect, it } from 'vitest';
import {
  cpfValido,
  formatarCpf,
  formatarTelefone,
  normalizarTelefone,
  telefoneValido,
} from './documento.js';

describe('cpfValido', () => {
  it('aceita um CPF consistente, com ou sem máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
  });

  /**
   * O caso que a conferência existe para pegar: o dedo que troca dois dígitos
   * vizinhos. O número continua com onze dígitos e continua parecendo um CPF.
   */
  it('recusa dois dígitos trocados de lugar', () => {
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('52998222475')).toBe(false);
  });

  it('recusa comprimento errado', () => {
    expect(cpfValido('5299822472')).toBe(false);
    expect(cpfValido('529982247251')).toBe(false);
    expect(cpfValido('')).toBe(false);
  });

  /**
   * 111.111.111-11 e os outros dez fecham a aritmética dos dígitos
   * verificadores. Sem a barreira explícita, passariam — e são exatamente o que
   * alguém digita para pular o campo.
   */
  it.each([
    '00000000000',
    '11111111111',
    '22222222222',
    '33333333333',
    '44444444444',
    '55555555555',
    '66666666666',
    '77777777777',
    '88888888888',
    '99999999999',
  ])('recusa %s, que fecha a conta mas não é CPF', (repetido) => {
    expect(cpfValido(repetido)).toBe(false);
  });

  /** Resto 10 vira dígito 0 — a regra que um `% 11` ingênuo erraria. */
  it('aceita CPF cujo verificador cai no resto que vale zero', () => {
    expect(cpfValido('111.444.777-35')).toBe(true);
  });
});

describe('formatarCpf', () => {
  it('põe a máscara', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
  });

  it('devolve intacto o que não tem onze dígitos, em vez de inventar máscara', () => {
    expect(formatarCpf('123')).toBe('123');
  });
});

describe('normalizarTelefone', () => {
  it('aceita celular e fixo com DDD', () => {
    expect(normalizarTelefone('(11) 98765-4321')).toBe('11987654321');
    expect(normalizarTelefone('11 3456-7890')).toBe('1134567890');
  });

  it('descarta o código do país', () => {
    expect(normalizarTelefone('+55 11 98765-4321')).toBe('11987654321');
  });

  /** Sem DDD, ninguém de outro estado consegue ligar. É dado inútil. */
  it('recusa número sem DDD', () => {
    expect(normalizarTelefone('98765-4321')).toBeNull();
  });

  it('recusa DDD que não existe', () => {
    expect(normalizarTelefone('0987654321')).toBeNull();
    expect(normalizarTelefone('10987654321')).toBeNull();
  });

  /** Nove dígitos que não começam em 9 são um fixo com um dígito sobrando. */
  it('recusa celular sem o nono dígito no lugar certo', () => {
    expect(normalizarTelefone('11887654321')).toBeNull();
  });

  it('recusa fixo começando em 0, 1, 6, 7, 8 ou 9', () => {
    expect(normalizarTelefone('1112345678')).toBeNull();
    expect(normalizarTelefone('1191234567')).toBeNull();
  });

  it('telefoneValido responde o mesmo que a normalização', () => {
    expect(telefoneValido('(11) 98765-4321')).toBe(true);
    expect(telefoneValido('98765-4321')).toBe(false);
  });
});

describe('formatarTelefone', () => {
  it('separa celular e fixo no ponto certo', () => {
    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(formatarTelefone('1134567890')).toBe('(11) 3456-7890');
  });

  it('devolve intacto o que não passa na conferência', () => {
    expect(formatarTelefone('123')).toBe('123');
  });
});
