import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const itemPublicoSchema = z.object({
  descricao: z.string(),
  doseMg: z.number(),
});

const formulacaoPublicaSchema = z.object({
  forma: z.string(),
  quantidade: z.number().int(),
  frequenciaHoras: z.number().int(),
  dias: z.number().int(),
  orientacao: z.string().nullable(),
  valorEmCentavos: z.number().int().nullable(),
  itens: z.array(itemPublicoSchema),
});

/**
 * A receita como o tutor a vê, sem login.
 *
 * O que está de fora é decisão, não esquecimento (ADR 0013): CPF vem
 * mascarado, telefone e endereço não vêm, e nada diz como o preço foi formado.
 */
export const receitaPublicaSchema = z.object({
  numero: z.number().int(),
  situacao: z.enum(['rascunho', 'valida', 'vencida', 'cancelada']),
  emitidaEm: z.iso.datetime(),
  validaAte: z.iso.datetime(),
  prazoMotivo: z.string(),
  motivoDoCancelamento: z.string().nullable(),
  clinicaNome: z.string().nullable(),
  veterinarioNome: z.string(),
  crmv: z.string(),
  tutorNome: z.string(),
  /** Só as pontas: `123.***.**9-09`. */
  tutorCpf: z.string().nullable(),
  pacienteNome: z.string(),
  pacienteEspecie: z.string(),
  formulacoes: z.array(formulacaoPublicaSchema),
  valorTotalEmCentavos: z.number().int(),
});

export class ReceitaPublicaDto extends createZodDto(receitaPublicaSchema) {}
