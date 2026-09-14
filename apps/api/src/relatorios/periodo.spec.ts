import { periodoDoMes } from './periodo';

/**
 * O intervalo do mês.
 *
 * Testado sozinho, sem banco, porque é aritmética de calendário — a classe de
 * código que parece óbvia e erra em silêncio. O erro que estes testes fecham
 * é o do limite superior: com `lte` no último dia à meia-noite, tudo que foi
 * prescrito depois das 00:00 do dia 30 sumia do relatório de setembro.
 */
describe('período do mês', () => {
  it('vai do primeiro dia até a virada do mês seguinte', () => {
    const { inicio, fim, rotulo } = periodoDoMes('2026-09');

    expect(inicio).toEqual(new Date(2026, 8, 1));
    expect(fim).toEqual(new Date(2026, 9, 1));
    expect(rotulo).toBe('2026-09');
  });

  it('dezembro vira janeiro do ano seguinte', () => {
    const { fim } = periodoDoMes('2026-12');

    expect(fim).toEqual(new Date(2027, 0, 1));
  });

  it('fevereiro de ano bissexto termina em 1º de março, como todo fevereiro', () => {
    // O ponto de usar a virada: não é preciso saber se fevereiro tem 28 ou 29.
    expect(periodoDoMes('2024-02').fim).toEqual(new Date(2024, 2, 1));
    expect(periodoDoMes('2026-02').fim).toEqual(new Date(2026, 2, 1));
  });

  it('o último instante do mês cai dentro do intervalo', () => {
    const { inicio, fim } = periodoDoMes('2026-09');
    const ultimoSuspiro = new Date(2026, 8, 30, 23, 59, 59, 999);

    expect(ultimoSuspiro >= inicio).toBe(true);
    expect(ultimoSuspiro < fim).toBe(true);
  });

  it('o primeiro instante do mês seguinte cai fora', () => {
    const { fim } = periodoDoMes('2026-09');

    expect(new Date(2026, 9, 1, 0, 0, 0, 0) < fim).toBe(false);
  });

  it('sem argumento, é o mês corrente', () => {
    const agora = new Date();
    const { inicio } = periodoDoMes();

    expect(inicio).toEqual(new Date(agora.getFullYear(), agora.getMonth(), 1));
  });

  it.each(['2026', '2026-9', '09-2026', 'setembro', '2026-09-01'])(
    'recusa %p, em vez de inventar um mês',
    (entrada) => {
      expect(() => periodoDoMes(entrada)).toThrow(RangeError);
    },
  );

  /**
   * Vazio é ausente, não erro: é o que o seletor de mês da tela manda quando
   * a pessoa limpa o campo, e recusar ali seria um erro vermelho sobre um
   * campo em branco que ninguém pediu para preencher.
   */
  it('trata o mês vazio como "o mês corrente"', () => {
    const agora = new Date();

    expect(periodoDoMes('').inicio).toEqual(new Date(agora.getFullYear(), agora.getMonth(), 1));
  });

  it.each(['2026-00', '2026-13', '2026-99'])('recusa o mês %p', (entrada) => {
    expect(() => periodoDoMes(entrada)).toThrow(/1 a 12/);
  });

  it.each(['1999-05', '0001-05'])('recusa o ano de %p', (entrada) => {
    expect(() => periodoDoMes(entrada)).toThrow(/2000 a 9999/);
  });
});
