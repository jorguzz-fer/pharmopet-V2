import { validarEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/pharmopet',
};

describe('validarEnv', () => {
  it('aceita configuração mínima e aplica os padrões', () => {
    const env = validarEnv({ ...base });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.ALLOWED_ORIGINS).toEqual([]);
  });

  it('recusa subir sem DATABASE_URL', () => {
    expect(() => validarEnv({})).toThrow(/DATABASE_URL/);
  });

  it('recusa DATABASE_URL que não é URL', () => {
    expect(() => validarEnv({ DATABASE_URL: 'nao-e-url' })).toThrow(/DATABASE_URL/);
  });

  it('converte PORT para número', () => {
    const env = validarEnv({ ...base, PORT: '8080' });
    expect(env.PORT).toBe(8080);
  });

  /**
   * A lista de origens vem do ambiente, não do código — foi exatamente o que
   * faltava no sistema anterior, onde o CORS era fixo e a variável era ignorada.
   */
  it('quebra ALLOWED_ORIGINS em lista, ignorando espaços e vazios', () => {
    const env = validarEnv({
      ...base,
      ALLOWED_ORIGINS: 'https://app.pharmopet.com.br, https://admin.pharmopet.com.br ,',
    });

    expect(env.ALLOWED_ORIGINS).toEqual([
      'https://app.pharmopet.com.br',
      'https://admin.pharmopet.com.br',
    ]);
  });
});
