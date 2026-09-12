import { MICRO_POR_CENTAVO, centavosParaMicro, microParaCentavos } from './dinheiro.js';

/**
 * Motor de precificação de formulação magistral.
 *
 * A fórmula vem do sistema anterior, onde foi conferida contra a planilha da
 * PharmoPet. Por ingrediente:
 *
 *   custo_efetivo    = max(custo, custo_de_referência)
 *   custo_do_item    = massa_em_gramas × custo_efetivo × markup
 *
 * E no fechamento:
 *
 *   subtotal    = Σ itens + taxa_de_manipulação + embalagens
 *   com_desconto = subtotal − subtotal × desconto
 *   final        = com_desconto + entrega (+ adicional de biscoito, se for o caso)
 *
 * Duas coisas mudaram em relação à v1, e as duas são correção, não gosto:
 *
 * 1. A conta é inteira, em micro-reais, e arredonda uma vez só no fim. A v1
 *    somava float e arredondava a centavo por ingrediente — o total dependia
 *    da ordem dos itens.
 * 2. A função é pura: não consulta banco. O que ela precisa saber chega por
 *    parâmetro. É o que permite testá-la sem infraestrutura e é o que vai
 *    permitir, quando existir cadastro de clínica, que as condições comerciais
 *    venham de lá sem tocar no cálculo.
 */

/** Insumo, já com tudo que o cálculo precisa saber sobre ele. */
export type InsumoParaCalculo = {
  codigo: string;
  descricao: string;
  /** Custo por grama, em micro-reais. */
  custoPorGramaEmMicro: number;
  /**
   * Piso de custo por grama, em micro-reais. Existe para a formulação nunca
   * ser vendida abaixo da reposição quando o custo gravado está defasado.
   */
  custoDeReferenciaPorGramaEmMicro: number;
  /**
   * Multiplicador sobre o custo, em centésimos: 648 é 6,48×.
   *
   * Zero ou negativo não é "de graça": é insumo sem regra de preço cadastrada,
   * e vira impedimento. No catálogo real da PharmoPet isso é um em cada quatro
   * — quase todo excipiente e veículo —, e a v1 os precificava como grátis, sem
   * avisar ninguém.
   */
  markupEmCentesimos: number;
  /**
   * Estoque disponível, em miligramas. `null` é "não sabemos", e é diferente de
   * zero: zero afirma falta, e afirmar falta sem saber enche a tela de aviso
   * falso, que é como se ensina alguém a ignorar avisos.
   */
  estoqueEmMiligramas: number | null;
  controlado: boolean;
  /** Lista da Portaria 344/98, ou ANTIMICROBIANO. Nulo quando não controlado. */
  listaDeControle: string | null;
  /** Formas em que este insumo não pode ser manipulado. */
  formasProibidas: readonly string[];
};

export type ItemDaFormula = {
  insumo: InsumoParaCalculo;
  /** Dose por unidade manipulada, em microgramas. Inteiro: veja `dinheiro.ts`. */
  dosePorUnidadeEmMicrogramas: number;
  /** Unidades a manipular — cápsulas, biscoitos, doses. */
  quantidade: number;
};

export type CondicoesComerciais = {
  taxaDeManipulacaoEmCentavos: number;
  custoDeEmbalagensEmCentavos: number;
  /** Desconto em pontos-base: 4000 é 40%. */
  descontoEmPontosBase: number;
  adicionalDeEntregaEmCentavos: number;
  /** Cobrado só quando a forma é biscoito ou petisco. */
  adicionalDeBiscoitoEmCentavos: number;
};

export type EntradaDaPrecificacao = {
  itens: readonly ItemDaFormula[];
  /** Nome da forma farmacêutica escolhida. */
  forma: string;
  condicoes: CondicoesComerciais;
};

/**
 * O que impede a fórmula de ser feita. Bloqueia o orçamento.
 *
 * `codigo` é o do insumo quando o problema é de um insumo específico, para a
 * tela conseguir apontar a linha certa.
 */
export type Impedimento = {
  tipo: 'forma-proibida' | 'sem-itens' | 'sem-regra-de-preco';
  codigo?: string;
  texto: string;
};

/** O que o prescritor precisa saber, mas não impede de seguir. */
export type Aviso = {
  tipo: 'sem-estoque' | 'controlado' | 'antimicrobiano';
  codigo: string;
  texto: string;
};

/** Detalhe por item. Nunca sai para o navegador do veterinário — veja abaixo. */
export type ItemPrecificado = {
  codigo: string;
  descricao: string;
  massaTotalEmMiligramas: number;
  custoEmCentavos: number;
};

/**
 * Resultado completo, com a composição do preço.
 *
 * **Isto não é resposta de API para o prescritor.** A farmácia decidiu que
 * custo por ingrediente, markup e desconto não aparecem nem para o veterinário
 * nem para o tutor — e o que chega ao navegador é visível, por mais que a tela
 * esconda. Quem monta a resposta recorta o que o papel pode ver.
 */
export type PrecificacaoCalculada = {
  itens: ItemPrecificado[];
  totalDeMateriaPrimaEmCentavos: number;
  taxaDeManipulacaoEmCentavos: number;
  custoDeEmbalagensEmCentavos: number;
  subtotalEmCentavos: number;
  descontoEmCentavos: number;
  adicionalDeEntregaEmCentavos: number;
  adicionalDeBiscoitoEmCentavos: number;
  valorFinalEmCentavos: number;
  avisos: Aviso[];
  impedimentos: Impedimento[];
};

const PONTOS_BASE = 10_000n;
/** Microgramas num grama. */
const MICROGRAMAS_POR_GRAMA = 1_000_000n;
/** Divisor do markup, que vem em centésimos. */
const CENTESIMOS = 100n;

function ehBiscoito(forma: string): boolean {
  const normalizada = forma.trim().toUpperCase();
  return normalizada.includes('BISCOITO') || normalizada.includes('PETISCO');
}

function proibida(insumo: InsumoParaCalculo, forma: string): boolean {
  const alvo = forma.trim().toUpperCase();
  return insumo.formasProibidas.some((f) => f.trim().toUpperCase() === alvo);
}

export function precificar(entrada: EntradaDaPrecificacao): PrecificacaoCalculada {
  const { itens, forma, condicoes } = entrada;

  const avisos: Aviso[] = [];
  const impedimentos: Impedimento[] = [];

  if (itens.length === 0) {
    impedimentos.push({ tipo: 'sem-itens', texto: 'A fórmula precisa de pelo menos um insumo.' });
  }

  const detalhados: ItemPrecificado[] = [];

  // Acumula o numerador inteiro e divide uma vez. Dividir por item truncaria
  // cada um, e o erro cresceria com o número de ingredientes.
  let numeradorDaMateriaPrima = 0n;

  for (const item of itens) {
    const { insumo } = item;

    if (proibida(insumo, forma)) {
      impedimentos.push({
        tipo: 'forma-proibida',
        codigo: insumo.codigo,
        texto: `${insumo.descricao} não pode ser manipulado em ${forma.toLowerCase()}.`,
      });
    }

    const massaEmMicrogramas =
      BigInt(Math.trunc(item.dosePorUnidadeEmMicrogramas)) * BigInt(Math.trunc(item.quantidade));

    const massaEmMiligramas = Number(massaEmMicrogramas / 1000n);

    // `null` é estoque não informado: não se afirma falta sobre o que não se
    // sabe. Avisar à toa é como se ensina alguém a ignorar avisos.
    if (insumo.estoqueEmMiligramas !== null) {
      if (insumo.estoqueEmMiligramas <= 0) {
        avisos.push({
          tipo: 'sem-estoque',
          codigo: insumo.codigo,
          texto: `${insumo.descricao} está sem estoque. Fale com a PharmoPet antes de confirmar.`,
        });
      } else if (massaEmMiligramas > insumo.estoqueEmMiligramas) {
        avisos.push({
          tipo: 'sem-estoque',
          codigo: insumo.codigo,
          texto: `${insumo.descricao} tem menos estoque do que esta fórmula precisa.`,
        });
      }
    }

    // Sem markup não há preço, e zero não é "de graça". No catálogo real isso
    // é um em cada quatro insumos — quase todo excipiente e veículo. A v1
    // multiplicava por zero e entregava o ingrediente sem cobrar.
    if (insumo.markupEmCentesimos <= 0) {
      impedimentos.push({
        tipo: 'sem-regra-de-preco',
        codigo: insumo.codigo,
        texto: `${insumo.descricao} está sem regra de preço cadastrada. A farmácia precisa definir o markup antes de orçar.`,
      });
    }

    if (insumo.controlado) {
      const antimicrobiano = insumo.listaDeControle === 'ANTIMICROBIANO';
      avisos.push({
        tipo: antimicrobiano ? 'antimicrobiano' : 'controlado',
        codigo: insumo.codigo,
        texto: antimicrobiano
          ? `${insumo.descricao} é antimicrobiano: exige receita em duas vias.`
          : insumo.listaDeControle
            ? `${insumo.descricao} é controlado, lista ${insumo.listaDeControle}: exige receituário próprio e a via original é recolhida na entrega.`
            : `${insumo.descricao} é controlado: exige receituário próprio.`,
      });
    }

    const custoEfetivo = BigInt(
      Math.max(
        Math.trunc(insumo.custoPorGramaEmMicro),
        Math.trunc(insumo.custoDeReferenciaPorGramaEmMicro),
      ),
    );

    const numeradorDoItem =
      massaEmMicrogramas * custoEfetivo * BigInt(Math.trunc(insumo.markupEmCentesimos));

    numeradorDaMateriaPrima += numeradorDoItem;

    detalhados.push({
      codigo: insumo.codigo,
      descricao: insumo.descricao,
      massaTotalEmMiligramas: massaEmMiligramas,
      // Valor por item é informativo, para a farmácia. A soma dos itens
      // arredondados pode diferir do total em um centavo — o que vale é o
      // total, calculado sem passar por estes arredondamentos.
      custoEmCentavos: microParaCentavos(numeradorDoItem / (MICROGRAMAS_POR_GRAMA * CENTESIMOS)),
    });
  }

  const materiaPrimaEmMicro = numeradorDaMateriaPrima / (MICROGRAMAS_POR_GRAMA * CENTESIMOS);

  const taxaEmMicro = centavosParaMicro(condicoes.taxaDeManipulacaoEmCentavos);
  const embalagensEmMicro = centavosParaMicro(condicoes.custoDeEmbalagensEmCentavos);

  const subtotalEmMicro = materiaPrimaEmMicro + taxaEmMicro + embalagensEmMicro;

  const descontoEmMicro =
    (subtotalEmMicro * BigInt(Math.trunc(condicoes.descontoEmPontosBase))) / PONTOS_BASE;

  const entregaEmMicro = centavosParaMicro(condicoes.adicionalDeEntregaEmCentavos);
  const adicionalDeBiscoitoEmMicro = ehBiscoito(forma)
    ? centavosParaMicro(condicoes.adicionalDeBiscoitoEmCentavos)
    : 0n;

  const finalEmMicro =
    subtotalEmMicro - descontoEmMicro + entregaEmMicro + adicionalDeBiscoitoEmMicro;

  return {
    itens: detalhados,
    totalDeMateriaPrimaEmCentavos: microParaCentavos(materiaPrimaEmMicro),
    taxaDeManipulacaoEmCentavos: condicoes.taxaDeManipulacaoEmCentavos,
    custoDeEmbalagensEmCentavos: condicoes.custoDeEmbalagensEmCentavos,
    subtotalEmCentavos: microParaCentavos(subtotalEmMicro),
    descontoEmCentavos: microParaCentavos(descontoEmMicro),
    adicionalDeEntregaEmCentavos: condicoes.adicionalDeEntregaEmCentavos,
    adicionalDeBiscoitoEmCentavos: microParaCentavos(adicionalDeBiscoitoEmMicro),
    valorFinalEmCentavos: microParaCentavos(finalEmMicro),
    avisos,
    impedimentos,
  };
}

/** `MICRO_POR_CENTAVO` reexportado para quem monta fixture de teste. */
export { MICRO_POR_CENTAVO };
