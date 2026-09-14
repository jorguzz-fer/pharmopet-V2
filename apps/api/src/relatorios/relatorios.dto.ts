import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * O mês pedido.
 *
 * A forma é conferida aqui para dar 400 com mensagem, em vez de deixar o
 * `RangeError` do `periodoDoMes` virar 500. A validação de faixa continua lá
 * — é ela que sabe o que é um mês possível, e o schema só guarda a forma.
 */
export const filtroDoRelatorioSchema = z.object({
  mes: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'O mês precisa vir como AAAA-MM.')
    .optional(),
});
export class FiltroDoRelatorioDto extends createZodDto(filtroDoRelatorioSchema) {}

/** Uma quebra do relatório: quem, quantas receitas, quanto valor. */
export const linhaDoRelatorioSchema = z.object({
  /** Nulo na linha do atendimento sem clínica, que não tem cadastro atrás. */
  id: z.uuid().nullable(),
  nome: z.string(),
  /** CRMV, na quebra por veterinário. Nulo quando não se aplica. */
  detalhe: z.string().nullable(),
  receitas: z.number().int().nonnegative(),
  valorEmCentavos: z.number().int().nonnegative(),
});

/**
 * O relatório do mês.
 *
 * `valorEmCentavos` é **valor prescrito**, não faturamento (ADR 0017): soma
 * das receitas emitidas, e não do que foi pago — não há meio de pagamento.
 * O nome do campo carrega isso de propósito, e é a primeira defesa contra a
 * tela voltar a chamá-lo de outra coisa.
 */
export const relatorioDePrescricoesSchema = z.object({
  mes: z.string(),
  receitas: z.number().int().nonnegative(),
  valorEmCentavos: z.number().int().nonnegative(),
  porVeterinario: z.array(linhaDoRelatorioSchema),
  porClinica: z.array(linhaDoRelatorioSchema),
});
export class RelatorioDePrescricoesDto extends createZodDto(relatorioDePrescricoesSchema) {}
