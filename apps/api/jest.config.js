/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    // O pacote entra pelo fonte, e não pelo dist: assim um teste da API roda
    // contra a versão atual do domínio sem depender de um build anterior.
    '^@pharmopet/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    // Esse fonte é ESM e escreve o import relativo com extensão .js, como
    // "nodenext" exige. O Jest resolve em CommonJS e não acharia o arquivo;
    // a extensão sai aqui. Não afeta o código da API, que não a usa.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Um arquivo por vez. Os testes de integração falam com o mesmo banco e
  // limpam as tabelas entre si; em paralelo, um apagava os dados do outro no
  // meio da execução — e a falha aparecia num lugar sem relação com a causa.
  // Dar um schema por worker resolveria também, ao custo de aplicar as
  // migrations N vezes; com a suíte em segundos, não paga.
  maxWorkers: 1,
};
