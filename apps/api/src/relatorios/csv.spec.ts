import { montarCsv, reaisParaPlanilha } from './csv';

/**
 * O CSV.
 *
 * Testado porque os três defeitos que ele evita são invisíveis daqui: só
 * aparecem quando alguém abre o arquivo no Excel em português e vê tudo numa
 * coluna, ou "ClÃ­nica", ou uma coluna de dinheiro que não soma.
 */
describe('CSV para planilha', () => {
  it('separa por ponto e vírgula, que é o que o Excel em pt-BR espera', () => {
    const csv = montarCsv(['a', 'b'], [['1', '2']]);

    expect(csv).toContain('a;b');
    expect(csv).toContain('1;2');
  });

  it('começa com BOM, senão o acento vira lixo no Excel', () => {
    expect(montarCsv(['Clínica'], []).charCodeAt(0)).toBe(0xfeff);
  });

  it('termina as linhas com CRLF', () => {
    expect(montarCsv(['a'], [['1']])).toBe('﻿a\r\n1\r\n');
  });

  describe('escape', () => {
    it('protege o campo que traz o separador', () => {
      expect(montarCsv(['x'], [['Silva; Maria']])).toContain('"Silva; Maria"');
    });

    it('protege o campo com quebra de linha, que viraria duas linhas', () => {
      const csv = montarCsv(['x'], [['primeira\nsegunda']]);

      expect(csv).toContain('"primeira\nsegunda"');
      // Três quebras seriam: cabeçalho, a de dentro do campo, e o fim.
      expect(csv.split('\r\n')).toHaveLength(3);
    });

    it('dobra as aspas de dentro', () => {
      expect(montarCsv(['x'], [['o "Bidu"']])).toContain('"o ""Bidu"""');
    });

    it('deixa em paz o campo comum', () => {
      expect(montarCsv(['x'], [['Amora']])).toContain('\r\nAmora\r\n');
    });
  });

  describe('dinheiro', () => {
    it('sai com vírgula decimal e sem cifrão, para a planilha somar', () => {
      expect(reaisParaPlanilha(12_345)).toBe('123,45');
      expect(reaisParaPlanilha(0)).toBe('0,00');
      expect(reaisParaPlanilha(5)).toBe('0,05');
    });

    it('não arredonda para menos de dois dígitos', () => {
      expect(reaisParaPlanilha(100)).toBe('1,00');
      expect(reaisParaPlanilha(1_000_000)).toBe('10000,00');
    });
  });
});
