import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ESPECIES = ['CANINO', 'FELINO', 'EQUINO', 'AVE', 'ROEDOR', 'REPTIL'] as const;

/**
 * Uma formulação como o extrator a deixa no JSON.
 *
 * O extrator também guarda `itens`, a composição já quebrada em linhas com a
 * marca de veículo. Ele não entra no banco: serviu para medir como os ativos
 * são dosados — foi assim que se soube das 105 formulações em percentual que a
 * ADR 0015 cita — e a tela mostra a composição como texto, que é como o guia a
 * escreve. Guardar as duas formas seria manter duas verdades sobre a mesma
 * coisa.
 */
export const formulacaoDoArquivoSchema = z.object({
  numero: z.string().min(1),
  titulo: z.string().min(1),
  linhaTerapeutica: z.string().min(1),
  linhaExclusiva: z.string().nullable().optional(),
  formaFarmaceutica: z.string().nullable().optional(),
  indicacao: z.string().nullable().optional(),
  diferencial: z.string().nullable().optional(),
  composicao: z.string().nullable().optional(),
  modoDeUsar: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  especies: z.array(z.enum(ESPECIES)).default([]),
});

export const formulacoesDoBularioSchema = z.array(formulacaoDoArquivoSchema);

/**
 * O que a lista devolve.
 *
 * Sem composição, modo de usar nem observações: são blocos longos, e 315 deles
 * na mesma resposta seriam quase um megabyte para mostrar uma lista de títulos.
 * Quem abre uma formulação pede aquela.
 */
export const resumoDoBularioSchema = z.object({
  id: z.uuid(),
  numero: z.string(),
  titulo: z.string(),
  linhaTerapeutica: z.string(),
  linhaExclusiva: z.string().nullable(),
  formaFarmaceutica: z.string().nullable(),
  indicacao: z.string().nullable(),
  especies: z.array(z.enum(ESPECIES)),
});
export class ResumoDoBularioDto extends createZodDto(resumoDoBularioSchema) {}

export const listaDoBularioSchema = z.object({
  formulacoes: z.array(resumoDoBularioSchema),
  /**
   * Quantas casam com a busca, e não quantas vieram.
   *
   * A lista tem teto, e sem o total a tela diria "50 formulações" quando são
   * 87 — número errado numa tela cuja função é dizer o que existe.
   */
  total: z.int().nonnegative(),
});
export class ListaDoBularioDto extends createZodDto(listaDoBularioSchema) {}

/** A formulação inteira, como o guia a escreve. */
export const formulacaoDoBularioSchema = resumoDoBularioSchema.extend({
  diferencial: z.string().nullable(),
  composicao: z.string().nullable(),
  modoDeUsar: z.string().nullable(),
  observacoes: z.string().nullable(),
});
export class FormulacaoDoBularioDto extends createZodDto(formulacaoDoBularioSchema) {}

/**
 * Os filtros da busca.
 *
 * `busca` casa com título, indicação e composição ao mesmo tempo, porque são as
 * três perguntas que se faz a um bulário e quem pergunta não sabe em qual campo
 * a resposta está: "otite" está na indicação, "cetoconazol" na composição e
 * "xampu" no título.
 */
export const filtroDoBularioSchema = z.object({
  busca: z.string().trim().max(160).optional(),
  linhaTerapeutica: z.string().trim().max(120).optional(),
  especie: z.enum(ESPECIES).optional(),
});
export class FiltroDoBularioDto extends createZodDto(filtroDoBularioSchema) {}

/** As linhas terapêuticas que existem, com quantas formulações cada uma tem. */
export const linhasDoBularioSchema = z.object({
  linhas: z.array(z.object({ nome: z.string(), quantidade: z.int().nonnegative() })),
});
export class LinhasDoBularioDto extends createZodDto(linhasDoBularioSchema) {}
