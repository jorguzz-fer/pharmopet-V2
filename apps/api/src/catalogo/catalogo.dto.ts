import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Dose em miligramas, na entrada, com no máximo três casas.
 *
 * A conta roda em micrograma inteiro (veja `dinheiro.ts`), mas quem prescreve
 * pensa em miligrama — obrigar a tela a converter só empurraria a conversão
 * para um lugar com menos teste. Três casas é o micrograma, e mais que isso
 * seria precisão que nenhuma balança de farmácia entrega.
 */
const doseMgSchema = z
  .number()
  .positive('A dose precisa ser maior que zero.')
  .max(100_000, 'Dose acima do que qualquer formulação usa — confira a unidade.')
  .refine((v) => Number.isInteger(v * 1000), 'A dose aceita no máximo três casas decimais.');

export const itemDaFormulaSchema = z.object({
  insumoId: z.uuid(),
  doseMg: doseMgSchema,
  quantidade: z
    .number()
    .int('A quantidade é em unidades inteiras.')
    .positive()
    .max(1_000, 'Quantidade acima do que a farmácia manipula numa fórmula.'),
});

export const precificarSchema = z.object({
  formaId: z.uuid(),
  itens: z.array(itemDaFormulaSchema).min(1, 'A fórmula precisa de pelo menos um insumo.').max(20),
  /** Informado, a resposta confere cada dose contra a faixa terapêutica. */
  paciente: z
    .object({
      especie: z.enum(['CANINO', 'FELINO', 'EQUINO', 'AVE', 'ROEDOR', 'REPTIL']),
      pesoEmGramas: z.number().int().positive().max(2_000_000),
    })
    .optional(),
});
export class PrecificarDto extends createZodDto(precificarSchema) {}

const avisoSchema = z.object({
  tipo: z.enum(['sem-estoque', 'controlado', 'antimicrobiano', 'fora-da-faixa', 'sem-referencia']),
  insumoId: z.uuid().nullable(),
  texto: z.string(),
});

/**
 * O que o prescritor recebe.
 *
 * Só o valor final. Custo por insumo, markup e desconto **não entram aqui** —
 * a farmácia decidiu que esses números não aparecem para o veterinário nem
 * para o tutor, e o que chega ao navegador é visível por mais que a tela
 * esconda. Foi assim que a v1 vazou o papel do usuário dentro do token.
 */
export const orcamentoSchema = z.object({
  valorFinalEmCentavos: z.int().nonnegative(),
  /** Quantas unidades serão manipuladas, somando os itens. */
  forma: z.string(),
  avisos: z.array(avisoSchema),
  impedimentos: z.array(z.object({ insumoId: z.uuid().nullable(), texto: z.string() })),
});
export class OrcamentoDto extends createZodDto(orcamentoSchema) {}

/**
 * A mesma formulação, com a composição do preço. Só para quem opera a farmácia.
 */
export const orcamentoDetalhadoSchema = orcamentoSchema.extend({
  itens: z.array(
    z.object({
      insumoId: z.uuid(),
      descricao: z.string(),
      massaTotalEmMiligramas: z.int(),
      custoEmCentavos: z.int(),
    }),
  ),
  totalDeMateriaPrimaEmCentavos: z.int(),
  taxaDeManipulacaoEmCentavos: z.int(),
  custoDeEmbalagensEmCentavos: z.int(),
  subtotalEmCentavos: z.int(),
  descontoEmCentavos: z.int(),
  adicionalDeEntregaEmCentavos: z.int(),
  adicionalDeBiscoitoEmCentavos: z.int(),
});
export class OrcamentoDetalhadoDto extends createZodDto(orcamentoDetalhadoSchema) {}

/** Insumo como o prescritor o vê: sem custo, sem markup, sem estoque em número. */
export const insumoPublicoSchema = z.object({
  id: z.uuid(),
  codigo: z.string(),
  descricao: z.string(),
  controlado: z.boolean(),
  listaDeControle: z.string().nullable(),
  /**
   * Situação, e não a quantidade: o número exato é informação comercial da
   * farmácia, e saber que são 4.310 mg não muda o que se prescreve.
   * `desconhecido` é diferente de `em-falta` — não se afirma falta sem saber.
   */
  estoque: z.enum(['disponivel', 'em-falta', 'desconhecido']),
  formasProibidas: z.array(z.object({ formaId: z.uuid(), nome: z.string(), motivo: z.string() })),
});
export class InsumoPublicoDto extends createZodDto(insumoPublicoSchema) {}

export const listaDeInsumosSchema = z.object({ insumos: z.array(insumoPublicoSchema) });
export class ListaDeInsumosDto extends createZodDto(listaDeInsumosSchema) {}

export const formaSchema = z.object({ id: z.uuid(), nome: z.string() });
export const listaDeFormasSchema = z.object({ formas: z.array(formaSchema) });
export class ListaDeFormasDto extends createZodDto(listaDeFormasSchema) {}

// --- Administração do catálogo ---

export const criarInsumoSchema = z.object({
  codigo: z.string().min(1).max(40),
  descricao: z.string().min(2).max(200),
  custoPorGramaEmMicro: z.int().nonnegative(),
  custoDeReferenciaPorGramaEmMicro: z.int().nonnegative().default(0),
  markupEmCentesimos: z.int().positive().max(100_000),
  estoqueEmMiligramas: z.int().nonnegative().nullable().optional(),
  controlado: z.boolean().default(false),
  listaDeControle: z.string().max(20).nullable().optional(),
});
export class CriarInsumoDto extends createZodDto(criarInsumoSchema) {}

export const insumoAdminSchema = insumoPublicoSchema.extend({
  custoPorGramaEmMicro: z.int(),
  custoDeReferenciaPorGramaEmMicro: z.int(),
  markupEmCentesimos: z.int(),
  estoqueEmMiligramas: z.int().nullable(),
});
export class InsumoAdminDto extends createZodDto(insumoAdminSchema) {}

export const criarFormaSchema = z.object({ nome: z.string().min(2).max(80) });
export class CriarFormaDto extends createZodDto(criarFormaSchema) {}

export class FormaDto extends createZodDto(formaSchema) {}

export const criarRestricaoSchema = z.object({
  insumoId: z.uuid(),
  formaId: z.uuid(),
  motivo: z.string().min(3).max(200),
});
export class CriarRestricaoDto extends createZodDto(criarRestricaoSchema) {}

export const condicoesSchema = z.object({
  taxaDeManipulacaoEmCentavos: z.int().nonnegative(),
  custoDeEmbalagensEmCentavos: z.int().nonnegative(),
  descontoEmPontosBase: z.int().min(0).max(10_000),
  adicionalDeEntregaEmCentavos: z.int().nonnegative(),
  adicionalDeBiscoitoEmCentavos: z.int().nonnegative(),
});
export class CondicoesDto extends createZodDto(condicoesSchema) {}

export const criarFaixaSchema = z
  .object({
    insumoId: z.uuid(),
    especie: z.enum(['CANINO', 'FELINO', 'EQUINO', 'AVE', 'ROEDOR', 'REPTIL']),
    pesoMinimoEmGramas: z.int().positive().nullable().optional(),
    pesoMaximoEmGramas: z.int().positive().nullable().optional(),
    doseMinimaEmMicrogramasPorKg: z.int().positive(),
    doseMaximaEmMicrogramasPorKg: z.int().positive(),
    duracaoMaximaEmDias: z.int().positive().nullable().optional(),
    observacao: z.string().max(500).nullable().optional(),
  })
  .refine((f) => f.doseMaximaEmMicrogramasPorKg >= f.doseMinimaEmMicrogramasPorKg, {
    message: 'A dose máxima não pode ser menor que a mínima.',
    path: ['doseMaximaEmMicrogramasPorKg'],
  })
  .refine(
    (f) =>
      f.pesoMinimoEmGramas == null ||
      f.pesoMaximoEmGramas == null ||
      f.pesoMaximoEmGramas >= f.pesoMinimoEmGramas,
    { message: 'O peso máximo não pode ser menor que o mínimo.', path: ['pesoMaximoEmGramas'] },
  );
export class CriarFaixaDto extends createZodDto(criarFaixaSchema) {}

export const faixaSchema = z.object({
  id: z.uuid(),
  insumoId: z.uuid(),
  especie: z.enum(['CANINO', 'FELINO', 'EQUINO', 'AVE', 'ROEDOR', 'REPTIL']),
  pesoMinimoEmGramas: z.int().nullable(),
  pesoMaximoEmGramas: z.int().nullable(),
  doseMinimaEmMicrogramasPorKg: z.int(),
  doseMaximaEmMicrogramasPorKg: z.int(),
  duracaoMaximaEmDias: z.int().nullable(),
  observacao: z.string().nullable(),
});
export class FaixaDto extends createZodDto(faixaSchema) {}
