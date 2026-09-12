import { describe, it, expect } from 'vitest';
import { contraste, atendeAA, paraRgb, MINIMO_AA_TEXTO } from './contraste';
import { cor, estado } from './tokens';

describe('contraste', () => {
  it('dá 21 entre preto e branco', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('dá 1 para a mesma cor', () => {
    expect(contraste('#1EB4AE', '#1EB4AE')).toBeCloseTo(1, 5);
  });

  it('é simétrico', () => {
    expect(contraste('#0B6F6A', '#FFFFFF')).toBeCloseTo(contraste('#FFFFFF', '#0B6F6A'), 6);
  });

  it('aceita hex de 3 dígitos', () => {
    expect(paraRgb('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('recusa hex inválido', () => {
    expect(() => paraRgb('#XYZ123')).toThrow(/inválida/);
  });
});

/**
 * Estes são os pares que a interface realmente usa. Se um token mudar e
 * derrubar o contraste, o build reprova aqui — antes de chegar na tela de um
 * veterinário tentando ler uma dose com pressa.
 */
describe('pares de cor da interface atendem WCAG AA', () => {
  const branco = cor.neutro[0];

  it.each([
    ['ação turquesa sobre branco', cor.turquesa[700], branco],
    ['branco sobre ação turquesa', branco, cor.turquesa[700]],
    ['texto lilás sobre branco', cor.lilas[700], branco],
    ['texto principal sobre fundo', cor.neutro[900], cor.neutro[50]],
    ['texto secundário sobre branco', cor.neutro[700], branco],
    ['texto de controlado sobre seu fundo', estado.controlado.texto, estado.controlado.fundo],
    [
      'texto de antimicrobiano sobre seu fundo',
      estado.antimicrobiano.texto,
      estado.antimicrobiano.fundo,
    ],
    ['texto de sucesso sobre seu fundo', estado.sucesso.texto, estado.sucesso.fundo],
  ])('%s', (_nome, frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(MINIMO_AA_TEXTO);
  });

  /**
   * O turquesa da marca é claro demais para texto — por isso existe o 700.
   * O teste registra a limitação para ninguém "simplificar" usando o 500.
   */
  it('o turquesa da marca NÃO serve como cor de texto sobre branco', () => {
    expect(atendeAA(cor.turquesa[500], branco)).toBe(false);
  });

  it('o lilás da marca NÃO serve como cor de texto sobre branco', () => {
    expect(atendeAA(cor.lilas[400], branco)).toBe(false);
  });
});
