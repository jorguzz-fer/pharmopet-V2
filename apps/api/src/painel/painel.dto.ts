import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Um estado da fila, com quantos pedidos estão nele. */
export const degrauDaFilaSchema = z.object({
  estado: z.enum(['EM_ANALISE', 'EM_PRODUCAO', 'PRONTO']),
  quantidade: z.number().int().nonnegative(),
});

export const veterinarioDoTopSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  crmv: z.string().nullable(),
  receitas: z.number().int().nonnegative(),
});

export const receitaRecenteSchema = z.object({
  id: z.uuid(),
  numero: z.number().int().nullable(),
  pacienteNome: z.string(),
  tutorNome: z.string(),
  estado: z.enum(['RASCUNHO', 'EMITIDA', 'CANCELADA']),
  criadaEm: z.iso.datetime(),
});

/**
 * O painel (ADR 0017).
 *
 * `valorPrescritoNoMesEmCentavos` não é faturamento, e o nome carrega isso de
 * propósito. É a soma das receitas **emitidas** no mês; ninguém pagou nada
 * ainda, porque não há meio de pagamento. A v1 chamava de "Faturamento" a soma
 * de todo orçamento criado — a tela dizia que entrou dinheiro que talvez nunca
 * entrasse, e o nome do campo é a primeira defesa contra repetir isso.
 *
 * `fila` e `topVeterinarios` são anuláveis, e nulo quer dizer "não é para este
 * papel" — diferente de lista vazia, que quer dizer "não há nenhum". A tela
 * precisa dos dois sentidos para não desenhar um bloco vazio a quem não deve
 * vê-lo.
 */
export const painelSchema = z.object({
  rascunhos: z.number().int().nonnegative(),
  emitidasNoMes: z.number().int().nonnegative(),
  vencendo: z.number().int().nonnegative(),
  valorPrescritoNoMesEmCentavos: z.number().int().nonnegative(),
  fila: z.array(degrauDaFilaSchema).nullable(),
  topVeterinarios: z.array(veterinarioDoTopSchema).nullable(),
  ultimas: z.array(receitaRecenteSchema),
});
export class PainelDto extends createZodDto(painelSchema) {}
