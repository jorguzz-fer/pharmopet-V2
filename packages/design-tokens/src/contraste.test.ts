import { describe, it, expect } from 'vitest';
import { contraste, atendeAA, paraRgb, MINIMO_AA_TEXTO } from './contraste.js';
import { cor, estado } from './tokens.js';

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
    ['texto lilás sobre fundo lilás', cor.lilas[700], cor.lilas[50]],
    ['texto principal sobre branco', cor.neutro[900], branco],
    ['texto principal sobre fundo da aplicação', cor.neutro[900], cor.neutro[50]],
    ['texto secundário sobre branco', cor.neutro[700], branco],
    ['texto secundário sobre fundo da aplicação', cor.neutro[700], cor.neutro[50]],
    ['texto de apoio sobre branco', cor.neutro[500], branco],
    ['texto de apoio sobre fundo da aplicação', cor.neutro[500], cor.neutro[50]],
    ['texto de apoio sobre superfície 100', cor.neutro[500], cor.neutro[100]],
    ['texto de controlado sobre seu fundo', estado.controlado.texto, estado.controlado.fundo],
    [
      'texto de antimicrobiano sobre seu fundo',
      estado.antimicrobiano.texto,
      estado.antimicrobiano.fundo,
    ],
    ['texto de sucesso sobre seu fundo', estado.sucesso.texto, estado.sucesso.fundo],
    ['marca sobre turquesa escuro', cor.sobreEscuro.marca, cor.turquesa[900]],
    ['marca secundária sobre turquesa escuro', cor.sobreEscuro.marcaSecundaria, cor.turquesa[900]],
    ['texto sobre turquesa escuro', cor.sobreEscuro.texto, cor.turquesa[900]],
    ['branco sobre turquesa escuro', branco, cor.turquesa[900]],
  ])('%s', (_nome, frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(MINIMO_AA_TEXTO);
  });

  /**
   * Neutros claros existem para borda, divisor e controle desabilitado. Se
   * alguém usá-los como texto, a leitura quebra — o teste fixa a fronteira.
   */
  it('neutro 300 não serve como cor de texto', () => {
    expect(atendeAA(cor.neutro[300], branco)).toBe(false);
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
