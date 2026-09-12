import { describe, expect, it } from 'vitest';
import { precificar, type CondicoesComerciais, type InsumoParaCalculo } from './precificacao.js';

/**
 * Insumo de referência: R$ 0,035120 por grama, markup 6,48×.
 *
 * Os números são fictícios mas na ordem de grandeza real do catálogo da
 * PharmoPet — custo de centésimos de real por grama, markup na casa de 6×.
 */
function insumo(sobrescreve: Partial<InsumoParaCalculo> = {}): InsumoParaCalculo {
  return {
    codigo: '665',
    descricao: 'Gabapentina',
    custoPorGramaEmMicro: 35_120,
    custoDeReferenciaPorGramaEmMicro: 0,
    markupEmCentesimos: 648,
    estoqueEmMiligramas: 500_000,
    controlado: false,
    listaDeControle: null,
    formasProibidas: [],
    ...sobrescreve,
  };
}

const SEM_CONDICOES: CondicoesComerciais = {
  taxaDeManipulacaoEmCentavos: 0,
  custoDeEmbalagensEmCentavos: 0,
  descontoEmPontosBase: 0,
  adicionalDeEntregaEmCentavos: 0,
  adicionalDeBiscoitoEmCentavos: 0,
};

describe('precificar', () => {
  it('cobra massa × custo × markup', () => {
    // 25 mg × 60 cápsulas = 1,5 g
    // 1,5 × 0,035120 × 6,48 = R$ 0,3414 → 34 centavos
    const resultado = precificar({
      itens: [{ insumo: insumo(), dosePorUnidadeEmMicrogramas: 25_000, quantidade: 60 }],
      forma: 'CÁPSULAS',
      condicoes: SEM_CONDICOES,
    });

    expect(resultado.itens[0]?.massaTotalEmMiligramas).toBe(1500);
    expect(resultado.valorFinalEmCentavos).toBe(34);
  });

  /**
   * O piso existe para a fórmula nunca sair abaixo da reposição quando o custo
   * gravado está defasado — o que acontece, porque insumo sobe de preço entre
   * uma atualização de tabela e outra.
   */
  it('usa o custo de referência quando ele é maior que o custo gravado', () => {
    const comPiso = precificar({
      itens: [
        {
          insumo: insumo({
            custoPorGramaEmMicro: 10_000,
            custoDeReferenciaPorGramaEmMicro: 35_120,
          }),
          dosePorUnidadeEmMicrogramas: 25_000,
          quantidade: 60,
        },
      ],
      forma: 'CÁPSULAS',
      condicoes: SEM_CONDICOES,
    });

    expect(comPiso.valorFinalEmCentavos).toBe(34);
  });

  it('ignora o piso quando o custo gravado já é maior', () => {
    const resultado = precificar({
      itens: [
        {
          insumo: insumo({
            custoPorGramaEmMicro: 35_120,
            custoDeReferenciaPorGramaEmMicro: 10_000,
          }),
          dosePorUnidadeEmMicrogramas: 25_000,
          quantidade: 60,
        },
      ],
      forma: 'CÁPSULAS',
      condicoes: SEM_CONDICOES,
    });

    expect(resultado.valorFinalEmCentavos).toBe(34);
  });

  it('soma os ingredientes da fórmula', () => {
    const resultado = precificar({
      itens: [
        { insumo: insumo(), dosePorUnidadeEmMicrogramas: 25_000, quantidade: 60 },
        {
          insumo: insumo({ codigo: '412', descricao: 'Tramadol' }),
          dosePorUnidadeEmMicrogramas: 4_000,
          quantidade: 60,
        },
      ],
      forma: 'CÁPSULAS',
      condicoes: SEM_CONDICOES,
    });

    // 1,5 g + 0,24 g = 1,74 g × 0,035120 × 6,48 = R$ 0,39602 → 40 centavos
    expect(resultado.valorFinalEmCentavos).toBe(40);
  });

  describe('fechamento comercial', () => {
    const condicoes: CondicoesComerciais = {
      taxaDeManipulacaoEmCentavos: 4_500,
      custoDeEmbalagensEmCentavos: 800,
      descontoEmPontosBase: 4_000,
      adicionalDeEntregaEmCentavos: 1_200,
      adicionalDeBiscoitoEmCentavos: 2_000,
    };

    it('aplica taxa, embalagem, desconto e entrega nessa ordem', () => {
      const resultado = precificar({
        itens: [{ insumo: insumo(), dosePorUnidadeEmMicrogramas: 25_000, quantidade: 60 }],
        forma: 'CÁPSULAS',
        condicoes,
      });

      // matéria-prima R$ 0,3414 + taxa 45,00 + embalagem 8,00 = 53,3414
      // desconto 40% = 21,33656 → resta 32,00484
      // + entrega 12,00 = R$ 44,00484 → 4400 centavos
      expect(resultado.subtotalEmCentavos).toBe(5334);
      expect(resultado.descontoEmCentavos).toBe(2134);
      expect(resultado.valorFinalEmCentavos).toBe(4400);
    });

    it('cobra o adicional quando a forma é biscoito', () => {
      const capsulas = precificar({
        itens: [{ insumo: insumo(), dosePorUnidadeEmMicrogramas: 25_000, quantidade: 60 }],
        forma: 'CÁPSULAS',
        condicoes,
      });
      const biscoitos = precificar({
        itens: [{ insumo: insumo(), dosePorUnidadeEmMicrogramas: 25_000, quantidade: 60 }],
        forma: 'BISCOITOS',
        condicoes,
      });

      expect(biscoitos.valorFinalEmCentavos - capsulas.valorFinalEmCentavos).toBe(2_000);
      expect(capsulas.adicionalDeBiscoitoEmCentavos).toBe(0);
    });

    it('reconhece petisco como biscoito', () => {
      const resultado = precificar({
        itens: [{ insumo: insumo(), dosePorUnidadeEmMicrogramas: 25_000, quantidade: 60 }],
        forma: 'Petisco mastigável',
        condicoes,
      });

      expect(resultado.adicionalDeBiscoitoEmCentavos).toBe(2_000);
    });
  });

  /**
   * Na v1 o total era a soma dos ingredientes já arredondados a centavo. Com
   * muitos ingredientes baratos, cada arredondamento empurrava para cima e o
   * total inflava — e mudava conforme a ordem dos itens.
   */
  describe('arredondamento', () => {
    it('arredonda uma vez, no fim, e não a cada ingrediente', () => {
      // Um grama a R$ 0,004 sem markup: 0,4 centavo por item. Arredondando
      // item a item, cada um vira zero e o total some; somando antes de
      // arredondar, dá 3,2 → 3 centavos.
      const barato = insumo({ custoPorGramaEmMicro: 4_000, markupEmCentesimos: 100 });
      const itens = Array.from({ length: 8 }, (_, i) => ({
        insumo: { ...barato, codigo: `b${i}` },
        dosePorUnidadeEmMicrogramas: 1_000_000,
        quantidade: 1,
      }));

      const resultado = precificar({ itens, forma: 'CÁPSULAS', condicoes: SEM_CONDICOES });

      expect(resultado.valorFinalEmCentavos).toBe(3);
    });

    it('não muda com a ordem dos ingredientes', () => {
      const a = {
        insumo: insumo({ codigo: 'a' }),
        dosePorUnidadeEmMicrogramas: 7_000,
        quantidade: 13,
      };
      const b = {
        insumo: insumo({ codigo: 'b', custoPorGramaEmMicro: 91_237 }),
        dosePorUnidadeEmMicrogramas: 3_000,
        quantidade: 29,
      };
      const c = {
        insumo: insumo({ codigo: 'c', markupEmCentesimos: 517 }),
        dosePorUnidadeEmMicrogramas: 11_000,
        quantidade: 7,
      };

      const direta = precificar({ itens: [a, b, c], forma: 'CÁPSULAS', condicoes: SEM_CONDICOES });
      const invertida = precificar({
        itens: [c, b, a],
        forma: 'CÁPSULAS',
        condicoes: SEM_CONDICOES,
      });

      expect(direta.valorFinalEmCentavos).toBe(invertida.valorFinalEmCentavos);
    });

    it('arredonda meio centavo para cima, e não para baixo', () => {
      // 1 g × 0,005 = meio centavo exato.
      const resultado = precificar({
        itens: [
          {
            insumo: insumo({ custoPorGramaEmMicro: 5_000, markupEmCentesimos: 100 }),
            dosePorUnidadeEmMicrogramas: 1_000_000,
            quantidade: 1,
          },
        ],
        forma: 'CÁPSULAS',
        condicoes: SEM_CONDICOES,
      });

      expect(resultado.valorFinalEmCentavos).toBe(1);
    });
  });

  describe('impedimentos', () => {
    it('bloqueia insumo que não pode ser feito na forma escolhida', () => {
      const resultado = precificar({
        itens: [
          {
            insumo: insumo({ formasProibidas: ['PASTA'] }),
            dosePorUnidadeEmMicrogramas: 25_000,
            quantidade: 60,
          },
        ],
        forma: 'pasta',
        condicoes: SEM_CONDICOES,
      });

      expect(resultado.impedimentos).toHaveLength(1);
      expect(resultado.impedimentos[0]).toMatchObject({ tipo: 'forma-proibida', codigo: '665' });
    });

    it('recusa fórmula vazia', () => {
      const resultado = precificar({ itens: [], forma: 'CÁPSULAS', condicoes: SEM_CONDICOES });

      expect(resultado.impedimentos[0]?.tipo).toBe('sem-itens');
      expect(resultado.valorFinalEmCentavos).toBe(0);
    });
  });

  describe('avisos', () => {
    it('avisa sem estoque, sem bloquear — a farmácia pode repor', () => {
      const resultado = precificar({
        itens: [
          {
            insumo: insumo({ estoqueEmMiligramas: 0 }),
            dosePorUnidadeEmMicrogramas: 25_000,
            quantidade: 60,
          },
        ],
        forma: 'CÁPSULAS',
        condicoes: SEM_CONDICOES,
      });

      expect(resultado.avisos[0]?.tipo).toBe('sem-estoque');
      expect(resultado.impedimentos).toHaveLength(0);
      expect(resultado.valorFinalEmCentavos).toBeGreaterThan(0);
    });

    it('avisa quando o estoque não cobre a fórmula', () => {
      const resultado = precificar({
        itens: [
          {
            insumo: insumo({ estoqueEmMiligramas: 100 }),
            dosePorUnidadeEmMicrogramas: 25_000,
            quantidade: 60,
          },
        ],
        forma: 'CÁPSULAS',
        condicoes: SEM_CONDICOES,
      });

      expect(resultado.avisos.map((a) => a.tipo)).toEqual(['sem-estoque']);
    });

    /**
     * O aviso precisa nomear a lista: o receituário de A2 não é o mesmo de C1,
     * e quem prescreve escolhe o bloco antes de imprimir.
     */
    it('nomeia a lista de controle no aviso', () => {
      const resultado = precificar({
        itens: [
          {
            insumo: insumo({ controlado: true, listaDeControle: 'A2' }),
            dosePorUnidadeEmMicrogramas: 25_000,
            quantidade: 60,
          },
        ],
        forma: 'CÁPSULAS',
        condicoes: SEM_CONDICOES,
      });

      expect(resultado.avisos[0]?.tipo).toBe('controlado');
      expect(resultado.avisos[0]?.texto).toContain('lista A2');
    });

    it('separa antimicrobiano de controlado, porque a exigência é outra', () => {
      const resultado = precificar({
        itens: [
          {
            insumo: insumo({ controlado: true, listaDeControle: 'ANTIMICROBIANO' }),
            dosePorUnidadeEmMicrogramas: 25_000,
            quantidade: 60,
          },
        ],
        forma: 'CÁPSULAS',
        condicoes: SEM_CONDICOES,
      });

      expect(resultado.avisos[0]?.tipo).toBe('antimicrobiano');
      expect(resultado.avisos[0]?.texto).toContain('duas vias');
    });
  });
});

/**
 * O catálogo real da PharmoPet trouxe casos que nenhuma fixture inventada
 * tinha. Estes testes guardam as correções que ele obrigou.
 */
describe('casos que o catálogo real revelou', () => {
  it('não precifica insumo sem markup — zero não é de graça', () => {
    const resultado = precificar({
      itens: [
        {
          insumo: insumo({ markupEmCentesimos: 0 }),
          dosePorUnidadeEmMicrogramas: 25_000,
          quantidade: 60,
        },
      ],
      forma: 'CÁPSULAS',
      condicoes: SEM_CONDICOES,
    });

    expect(resultado.impedimentos[0]).toMatchObject({ tipo: 'sem-regra-de-preco', codigo: '665' });
  });

  /** Dois insumos do catálogo têm markup negativo. Preço negativo não existe. */
  it('também bloqueia markup negativo', () => {
    const resultado = precificar({
      itens: [
        {
          insumo: insumo({ markupEmCentesimos: -5_385 }),
          dosePorUnidadeEmMicrogramas: 25_000,
          quantidade: 60,
        },
      ],
      forma: 'CÁPSULAS',
      condicoes: SEM_CONDICOES,
    });

    expect(resultado.impedimentos[0]?.tipo).toBe('sem-regra-de-preco');
  });

  /**
   * Estoque desconhecido não é estoque zerado. O export da farmácia não diz em
   * que unidade o estoque está, e importar tudo como zero encheria a tela de
   * "sem estoque" em setecentos insumos — que é como se ensina alguém a
   * ignorar avisos.
   */
  it('não afirma falta quando o estoque não é informado', () => {
    const resultado = precificar({
      itens: [
        {
          insumo: insumo({ estoqueEmMiligramas: null }),
          dosePorUnidadeEmMicrogramas: 25_000,
          quantidade: 60,
        },
      ],
      forma: 'CÁPSULAS',
      condicoes: SEM_CONDICOES,
    });

    expect(resultado.avisos).toHaveLength(0);
    expect(resultado.valorFinalEmCentavos).toBe(34);
  });

  it('continua avisando quando o estoque é conhecido e está zerado', () => {
    const resultado = precificar({
      itens: [
        {
          insumo: insumo({ estoqueEmMiligramas: 0 }),
          dosePorUnidadeEmMicrogramas: 25_000,
          quantidade: 60,
        },
      ],
      forma: 'CÁPSULAS',
      condicoes: SEM_CONDICOES,
    });

    expect(resultado.avisos[0]?.tipo).toBe('sem-estoque');
  });
});
