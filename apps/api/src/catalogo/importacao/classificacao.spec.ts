import { classificar, conferir, type LinhaDoExport } from './classificacao';

/** Gabapentina, como ela sai do export da farmácia. */
function linha(sobrescreve: Partial<LinhaDoExport> = {}): LinhaDoExport {
  return {
    codigo_interno: 665,
    descricao: 'Gabapentina',
    valor_custo: 0.31,
    custo_referencia: 0.31,
    markup: 648,
    un_manipulacao: 'mg',
    estoque: 2.3188,
    calculo_tipo: 'Cápsula',
    ...sobrescreve,
  };
}

describe('classificar', () => {
  it('converte a linha que o motor sabe precificar', () => {
    const resultado = classificar(linha());

    expect(resultado).toEqual({
      situacao: 'importavel',
      insumo: {
        codigo: '665',
        descricao: 'Gabapentina',
        custoPorGramaEmMicro: 310_000,
        custoDeReferenciaPorGramaEmMicro: 310_000,
        markupEmCentesimos: 648,
        estoqueEmMiligramas: null,
      },
    });
  });

  /**
   * O export traz um número de estoque sem dizer a unidade: a mediana é 2,21 e
   * o maior é 624.998, o que não fecha nem como grama nem como quilo. Importar
   * um palpite faria o sistema afirmar falta sobre o que não sabe.
   */
  it('não adivinha o estoque, mesmo quando o export traz um número', () => {
    const resultado = classificar(linha({ estoque: 11.682 }));

    expect(resultado).toMatchObject({ insumo: { estoqueEmMiligramas: null } });
  });

  describe('o que não entra', () => {
    /** 308 das 702 linhas são percentuais — 44% do catálogo. */
    it('bloqueia percentual, que é outra conta', () => {
      const resultado = classificar(linha({ calculo_tipo: 'Percentual' }));

      expect(resultado).toMatchObject({
        situacao: 'bloqueada',
        motivos: ['tipo-de-calculo-nao-suportado'],
      });
    });

    it('bloqueia QSP, que é o veículo que completa o volume', () => {
      expect(classificar(linha({ calculo_tipo: 'QSP' }))).toMatchObject({ situacao: 'bloqueada' });
    });

    /** Sem densidade ou título do lote, mililitro e UI não viram grama. */
    it.each(['ml', 'ui', 'ufc', 'un', '%', 'utr'])('bloqueia unidade %s', (un) => {
      expect(classificar(linha({ un_manipulacao: un }))).toMatchObject({
        situacao: 'bloqueada',
        motivos: ['unidade-nao-convertivel'],
      });
    });

    it.each(['mg', 'g', 'mcg'])('aceita unidade de massa %s', (un) => {
      expect(classificar(linha({ un_manipulacao: un })).situacao).toBe('importavel');
    });

    /** 160 linhas do catálogo real. Markup zero precificaria o insumo como grátis. */
    it('bloqueia markup zero', () => {
      expect(classificar(linha({ markup: 0 }))).toMatchObject({
        situacao: 'bloqueada',
        motivos: ['sem-regra-de-preco'],
      });
    });

    it('bloqueia markup negativo', () => {
      expect(classificar(linha({ markup: -53.85 }))).toMatchObject({
        situacao: 'bloqueada',
        motivos: ['sem-regra-de-preco'],
      });
    });

    /**
     * Uma linha do catálogo traz R$ 83.556,00 por grama, com estoque de
     * 624.998 — as duas coisas fora de escala na mesma linha. Importar isso
     * produziria um orçamento absurdo no primeiro uso.
     */
    it('bloqueia custo fora de qualquer escala plausível', () => {
      expect(classificar(linha({ valor_custo: 83_556 }))).toMatchObject({
        situacao: 'bloqueada',
        motivos: ['custo-implausivel'],
      });
    });

    it('bloqueia custo zerado, que não é preço', () => {
      expect(classificar(linha({ valor_custo: 0, custo_referencia: 0 }))).toMatchObject({
        situacao: 'bloqueada',
        motivos: ['custo-implausivel'],
      });
    });

    it('acumula os motivos, para o relatório explicar a linha inteira', () => {
      const resultado = classificar(
        linha({ calculo_tipo: 'Percentual', markup: 0, un_manipulacao: 'ml' }),
      );

      expect(resultado).toMatchObject({
        motivos: ['tipo-de-calculo-nao-suportado', 'unidade-nao-convertivel', 'sem-regra-de-preco'],
      });
    });

    it('não estoura em linha com formato inesperado', () => {
      expect(classificar({ descricao: 'sem os campos' })).toMatchObject({
        situacao: 'bloqueada',
        motivos: ['linha-invalida'],
      });
      expect(classificar(null)).toMatchObject({ motivos: ['linha-invalida'] });
    });
  });

  it('usa o maior entre custo e referência para julgar a escala', () => {
    // Custo zerado mas referência preenchida é linha boa: o motor usa o maior.
    expect(classificar(linha({ valor_custo: 0, custo_referencia: 0.31 })).situacao).toBe(
      'importavel',
    );
  });
});

describe('conferir', () => {
  it('separa o que entra do que não entra, e conta os motivos', () => {
    const relatorio = conferir([
      linha(),
      linha({ codigo_interno: 1, calculo_tipo: 'Percentual' }),
      linha({ codigo_interno: 2, markup: 0 }),
      linha({ codigo_interno: 3, calculo_tipo: 'QSP', un_manipulacao: 'ml' }),
    ]);

    expect(relatorio.total).toBe(4);
    expect(relatorio.importaveis).toHaveLength(1);
    expect(relatorio.bloqueadas).toHaveLength(3);
    expect(relatorio.porMotivo['tipo-de-calculo-nao-suportado']).toBe(2);
    expect(relatorio.porMotivo['sem-regra-de-preco']).toBe(1);
    expect(relatorio.porMotivo['unidade-nao-convertivel']).toBe(1);
  });

  it('aguenta export vazio', () => {
    expect(conferir([])).toMatchObject({ total: 0, importaveis: [], bloqueadas: [] });
  });
});
