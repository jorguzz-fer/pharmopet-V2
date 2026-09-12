/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@pharmopet/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  // Um arquivo por vez. Os testes de integração falam com o mesmo banco e
  // limpam as tabelas entre si; em paralelo, um apagava os dados do outro no
  // meio da execução — e a falha aparecia num lugar sem relação com a causa.
  // Dar um schema por worker resolveria também, ao custo de aplicar as
  // migrations N vezes; com a suíte em segundos, não paga.
  maxWorkers: 1,
};
