import { TENTATIVAS_ANTES_DE_BLOQUEAR, bloqueadoAte, esperaApos } from './bloqueio';

describe('bloqueio progressivo', () => {
  it('não bloqueia antes do limite — errar a senha é humano', () => {
    for (let falhas = 0; falhas < TENTATIVAS_ANTES_DE_BLOQUEAR; falhas++) {
      expect(esperaApos(falhas)).toBeNull();
    }
  });

  it('bloqueia na tentativa do limite', () => {
    expect(esperaApos(TENTATIVAS_ANTES_DE_BLOQUEAR)).toBe(30);
  });

  it('dobra a espera a cada falha seguinte', () => {
    expect(esperaApos(TENTATIVAS_ANTES_DE_BLOQUEAR + 1)).toBe(60);
    expect(esperaApos(TENTATIVAS_ANTES_DE_BLOQUEAR + 2)).toBe(120);
    expect(esperaApos(TENTATIVAS_ANTES_DE_BLOQUEAR + 3)).toBe(240);
  });

  /**
   * Sem teto, dobrar viraria bloqueio permanente em poucas rodadas — e aí
   * qualquer um trancaria a conta de um veterinário de propósito, só errando a
   * senha vinte vezes. O teto mantém a defesa e tira essa arma.
   */
  it('para de dobrar em quinze minutos', () => {
    expect(esperaApos(TENTATIVAS_ANTES_DE_BLOQUEAR + 20)).toBe(15 * 60);
    expect(esperaApos(TENTATIVAS_ANTES_DE_BLOQUEAR + 100)).toBe(15 * 60);
  });

  it('devolve o instante em que o bloqueio termina', () => {
    const agora = new Date('2026-09-12T10:00:00.000Z');

    expect(bloqueadoAte(TENTATIVAS_ANTES_DE_BLOQUEAR, agora)?.toISOString()).toBe(
      '2026-09-12T10:00:30.000Z',
    );
    expect(bloqueadoAte(1, agora)).toBeNull();
  });
});
