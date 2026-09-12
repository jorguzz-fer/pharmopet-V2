import { SenhaService } from './senha.service';

describe('SenhaService', () => {
  const senhas = new SenhaService();

  it('aceita a senha certa', async () => {
    const hash = await senhas.gerarHash('uma senha bem longa');

    await expect(senhas.conferir(hash, 'uma senha bem longa')).resolves.toBe(true);
  });

  it('recusa a senha errada', async () => {
    const hash = await senhas.gerarHash('uma senha bem longa');

    await expect(senhas.conferir(hash, 'uma senha bem longo')).resolves.toBe(false);
  });

  /**
   * Dois hashes iguais para a mesma senha significariam sal fixo — e aí uma
   * tabela pré-calculada quebraria o banco inteiro de uma vez.
   */
  it('gera hash diferente a cada vez, mesmo para a mesma senha', async () => {
    const a = await senhas.gerarHash('uma senha bem longa');
    const b = await senhas.gerarHash('uma senha bem longa');

    expect(a).not.toBe(b);
    await expect(senhas.conferir(b, 'uma senha bem longa')).resolves.toBe(true);
  });

  it('usa Argon2id, e não outro algoritmo', async () => {
    const hash = await senhas.gerarHash('uma senha bem longa');

    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  /**
   * Hash ilegível — truncado num backup, migrado errado — não pode virar
   * exceção que vaze pela resposta nem, muito menos, uma entrada aceita.
   */
  it('trata hash corrompido como senha errada, sem estourar', async () => {
    await expect(senhas.conferir('não é um hash', 'qualquer coisa')).resolves.toBe(false);
    await expect(senhas.conferir('', 'qualquer coisa')).resolves.toBe(false);
  });
});
