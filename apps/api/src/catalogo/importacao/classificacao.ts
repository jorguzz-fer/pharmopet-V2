import { z } from 'zod';

/**
 * Conferência do catálogo exportado pela farmácia.
 *
 * Existe porque o motor de preço foi escrito contra números inventados na ordem
 * de grandeza certa, e o catálogo real tem estrutura que esses números não
 * tinham. Antes de importar setecentas linhas, esta conferência diz, linha a
 * linha, o que entra e o que não entra — e por quê.
 *
 * A regra de ouro: **nada entra por suposição**. Uma linha que o sistema não
 * sabe precificar sai no relatório, não no banco com um palpite.
 */

/** Uma linha do export, como a farmácia a exporta hoje. */
export const linhaDoExportSchema = z.object({
  codigo_interno: z.number(),
  descricao: z.string(),
  /** Custo por grama, em reais. */
  valor_custo: z.number(),
  custo_referencia: z.number(),
  /** Markup em centésimos: 648 é 6,48×. */
  markup: z.number(),
  /** Unidade em que a farmácia manipula o insumo. */
  un_manipulacao: z.string(),
  estoque: z.number(),
  /** Como a dose é expressa: por cápsula, por percentual da fórmula, QSP. */
  calculo_tipo: z.string(),
});
export type LinhaDoExport = z.infer<typeof linhaDoExportSchema>;

/**
 * Unidades que o motor sabe converter para massa.
 *
 * O cálculo é massa × custo por grama. Mililitro, unidade internacional,
 * unidade formadora de colônia e UTR não convertem para grama sem a densidade
 * ou o título do lote — que o export não traz.
 */
const UNIDADES_DE_MASSA = new Set(['mg', 'g', 'mcg']);

/**
 * O único tipo de cálculo que o motor implementa hoje: dose fixa por unidade
 * manipulada. "Percentual" é fração da massa da fórmula e "QSP" é o veículo que
 * completa o volume — duas contas diferentes, nenhuma escrita ainda.
 */
const TIPO_SUPORTADO = 'Cápsula';

export type MotivoDeBloqueio =
  | 'tipo-de-calculo-nao-suportado'
  | 'unidade-nao-convertivel'
  | 'sem-regra-de-preco'
  | 'custo-implausivel'
  | 'linha-invalida';

export type Classificacao =
  | { situacao: 'importavel'; insumo: InsumoConvertido }
  | { situacao: 'bloqueada'; codigo: string; descricao: string; motivos: MotivoDeBloqueio[] };

export type InsumoConvertido = {
  codigo: string;
  descricao: string;
  custoPorGramaEmMicro: number;
  custoDeReferenciaPorGramaEmMicro: number;
  markupEmCentesimos: number;
  /**
   * Sempre `null` na importação.
   *
   * O export traz um número de estoque sem dizer a unidade: a mediana é 2,21 e
   * o maior é 624.998, o que não fecha nem como grama nem como quilo. Gravar um
   * palpite faria o sistema afirmar falta — ou abundância — sobre o que não
   * sabe. Fica em branco até a farmácia dizer a unidade.
   */
  estoqueEmMiligramas: null;
};

/**
 * Teto de sanidade para custo por grama.
 *
 * O insumo mais caro plausível do catálogo fica abaixo de R$ 500/g. Uma linha
 * com R$ 83.556,00 por grama é erro de digitação ou de exportação, e importá-la
 * produziria um orçamento absurdo no primeiro uso.
 */
const CUSTO_MAXIMO_POR_GRAMA_EM_REAIS = 1_000;

/** Reais por grama → micro-reais por grama, inteiro. */
function paraMicroPorGrama(reais: number): number {
  return Math.round(reais * 1_000_000);
}

export function classificar(bruta: unknown): Classificacao {
  const analise = linhaDoExportSchema.safeParse(bruta);

  if (!analise.success) {
    const registro = bruta as Record<string, unknown>;
    return {
      situacao: 'bloqueada',
      codigo: String(registro?.['codigo_interno'] ?? '?'),
      descricao: String(registro?.['descricao'] ?? '(sem descrição)'),
      motivos: ['linha-invalida'],
    };
  }

  const linha = analise.data;
  const motivos: MotivoDeBloqueio[] = [];

  if (linha.calculo_tipo !== TIPO_SUPORTADO) motivos.push('tipo-de-calculo-nao-suportado');
  if (!UNIDADES_DE_MASSA.has(linha.un_manipulacao)) motivos.push('unidade-nao-convertivel');
  if (linha.markup <= 0) motivos.push('sem-regra-de-preco');

  const maiorCusto = Math.max(linha.valor_custo, linha.custo_referencia);
  if (maiorCusto <= 0 || maiorCusto > CUSTO_MAXIMO_POR_GRAMA_EM_REAIS) {
    motivos.push('custo-implausivel');
  }

  if (motivos.length > 0) {
    return {
      situacao: 'bloqueada',
      codigo: String(linha.codigo_interno),
      descricao: linha.descricao,
      motivos,
    };
  }

  return {
    situacao: 'importavel',
    insumo: {
      codigo: String(linha.codigo_interno),
      descricao: linha.descricao.trim(),
      custoPorGramaEmMicro: paraMicroPorGrama(linha.valor_custo),
      custoDeReferenciaPorGramaEmMicro: paraMicroPorGrama(linha.custo_referencia),
      markupEmCentesimos: Math.round(linha.markup),
      estoqueEmMiligramas: null,
    },
  };
}

export type Relatorio = {
  total: number;
  importaveis: InsumoConvertido[];
  bloqueadas: Extract<Classificacao, { situacao: 'bloqueada' }>[];
  /** Quantas linhas por motivo. Uma linha pode ter mais de um. */
  porMotivo: Record<MotivoDeBloqueio, number>;
};

export function conferir(linhas: readonly unknown[]): Relatorio {
  const importaveis: InsumoConvertido[] = [];
  const bloqueadas: Extract<Classificacao, { situacao: 'bloqueada' }>[] = [];
  const porMotivo: Record<MotivoDeBloqueio, number> = {
    'tipo-de-calculo-nao-suportado': 0,
    'unidade-nao-convertivel': 0,
    'sem-regra-de-preco': 0,
    'custo-implausivel': 0,
    'linha-invalida': 0,
  };

  for (const bruta of linhas) {
    const resultado = classificar(bruta);

    if (resultado.situacao === 'importavel') {
      importaveis.push(resultado.insumo);
    } else {
      bloqueadas.push(resultado);
      for (const motivo of resultado.motivos) porMotivo[motivo] += 1;
    }
  }

  return { total: linhas.length, importaveis, bloqueadas, porMotivo };
}
