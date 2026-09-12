import { describe, expect, it } from 'vitest';
import {
  PRAZO_PADRAO_EM_DIAS,
  descreverSituacao,
  podeSerAtendida,
  prazoDaReceita,
  situacaoDaReceita,
  venceEm,
} from './receita.js';

const EMISSAO = new Date('2026-03-01T10:00:00.000Z');

describe('prazoDaReceita', () => {
  it('receita comum cai no prazo de operação', () => {
    const prazo = prazoDaReceita([null, null]);

    expect(prazo).toEqual({ tipo: 'definido', dias: PRAZO_PADRAO_EM_DIAS, motivo: expect.any(String) });
  });

  it.each([
    ['A2', 30],
    ['B1', 30],
    ['C1', 30],
    ['ANTIMICROBIANO', 10],
  ])('lista %s vence em %i dias', (lista, dias) => {
    expect(prazoDaReceita([lista])).toMatchObject({ tipo: 'definido', dias });
  });

  /**
   * O caso que a regra existe para acertar: a folha é uma só. Misturar um
   * antimicrobiano com um controlado de trinta dias não dá trinta dias ao
   * antimicrobiano — dá dez dias à receita inteira.
   */
  it('vale o prazo mais curto entre os itens', () => {
    expect(prazoDaReceita(['C1', 'ANTIMICROBIANO', null])).toMatchObject({ dias: 10 });
    expect(prazoDaReceita(['ANTIMICROBIANO', 'C1'])).toMatchObject({ dias: 10 });
  });

  it('não se confunde com espaço e caixa no cadastro', () => {
    expect(prazoDaReceita([' antimicrobiano '])).toMatchObject({ dias: 10 });
  });

  /**
   * Lista nova na portaria, ou erro de digitação no cadastro do insumo. Cair no
   * prazo padrão daria seis meses a um entorpecente. Recusar é o único
   * comportamento defensável.
   */
  it('recusa uma lista que não conhece, em vez de cair no padrão', () => {
    expect(prazoDaReceita(['C3'])).toEqual({ tipo: 'lista-desconhecida', lista: 'C3' });
    expect(prazoDaReceita([null, 'B9'])).toEqual({ tipo: 'lista-desconhecida', lista: 'B9' });
  });

  it('trata lista vazia como não controlado', () => {
    expect(prazoDaReceita(['', '   '])).toMatchObject({ dias: PRAZO_PADRAO_EM_DIAS });
  });
});

describe('venceEm', () => {
  it('soma os dias ao instante da emissão', () => {
    expect(venceEm(EMISSAO, 30).toISOString()).toBe('2026-03-31T10:00:00.000Z');
    expect(venceEm(EMISSAO, 10).toISOString()).toBe('2026-03-11T10:00:00.000Z');
  });

  /** Trinta dias a partir de 15 de janeiro caem em fevereiro, não no dia 45. */
  it('atravessa a virada de mês', () => {
    expect(venceEm(new Date('2026-01-15T00:00:00.000Z'), 30).toISOString()).toBe(
      '2026-02-14T00:00:00.000Z',
    );
  });

  it('atravessa a virada de ano', () => {
    expect(venceEm(new Date('2026-12-20T00:00:00.000Z'), 30).toISOString()).toBe(
      '2027-01-19T00:00:00.000Z',
    );
  });
});

describe('situacaoDaReceita', () => {
  const validaAte = venceEm(EMISSAO, 30);

  it('rascunho é rascunho, com ou sem prazo', () => {
    expect(situacaoDaReceita({ estado: 'RASCUNHO', validaAte: null }, EMISSAO)).toBe('rascunho');
  });

  it('cancelada continua cancelada mesmo dentro do prazo', () => {
    expect(situacaoDaReceita({ estado: 'CANCELADA', validaAte }, EMISSAO)).toBe('cancelada');
  });

  it('emitida vale até o instante do vencimento, inclusive', () => {
    expect(situacaoDaReceita({ estado: 'EMITIDA', validaAte }, EMISSAO)).toBe('valida');
    expect(situacaoDaReceita({ estado: 'EMITIDA', validaAte }, validaAte)).toBe('valida');
  });

  it('um milissegundo depois, venceu', () => {
    const depois = new Date(validaAte.getTime() + 1);

    expect(situacaoDaReceita({ estado: 'EMITIDA', validaAte }, depois)).toBe('vencida');
  });

  /** Dado corrompido não vira permissão. */
  it('emitida sem prazo conta como vencida', () => {
    expect(situacaoDaReceita({ estado: 'EMITIDA', validaAte: null }, EMISSAO)).toBe('vencida');
  });
});

describe('podeSerAtendida', () => {
  const validaAte = venceEm(EMISSAO, 30);

  it('só a receita válida passa', () => {
    expect(podeSerAtendida({ estado: 'EMITIDA', validaAte }, EMISSAO)).toBe(true);
    expect(podeSerAtendida({ estado: 'RASCUNHO', validaAte: null }, EMISSAO)).toBe(false);
    expect(podeSerAtendida({ estado: 'CANCELADA', validaAte }, EMISSAO)).toBe(false);
    expect(
      podeSerAtendida({ estado: 'EMITIDA', validaAte }, new Date(validaAte.getTime() + 1)),
    ).toBe(false);
  });
});

describe('descreverSituacao', () => {
  it('cala quando a receita está válida', () => {
    expect(descreverSituacao('valida')).toBeNull();
  });

  it.each(['rascunho', 'vencida', 'cancelada'] as const)('explica %s', (situacao) => {
    expect(descreverSituacao(situacao)).toEqual(expect.any(String));
  });
});
