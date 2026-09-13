import { DESTINOS, ESTADOS_DO_PEDIDO } from '@pharmopet/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** O que quem prescreve manda para a farmácia. */
export const enviarPedidoSchema = z.object({
  receitaId: z.uuid(),
  destino: z.enum(DESTINOS),
  observacoes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export class EnviarPedidoDto extends createZodDto(enviarPedidoSchema) {}

/**
 * A mudança de estado, com motivo quando cancela.
 *
 * O motivo é exigido no serviço e não aqui: um schema que o torna obrigatório
 * sempre pediria justificativa para mandar um pedido à produção, e um campo
 * que se preenche por obrigação vira "ok" em toda linha da auditoria.
 */
export const mudarEstadoSchema = z.object({
  estado: z.enum(ESTADOS_DO_PEDIDO),
  motivo: z.string().trim().min(3).max(500).optional(),
});
export class MudarEstadoDto extends createZodDto(mudarEstadoSchema) {}

const pedidoSchema = z.object({
  id: z.uuid(),
  numero: z.int(),
  estado: z.enum(ESTADOS_DO_PEDIDO),
  destino: z.enum(DESTINOS),
  enderecoDeEntrega: z.string(),
  observacoes: z.string().nullable(),
  motivoDoCancelamento: z.string().nullable(),

  receitaId: z.uuid(),
  receitaNumero: z.int().nullable(),
  pacienteNome: z.string(),
  tutorNome: z.string(),
  clinicaNome: z.string().nullable(),
  veterinarioNome: z.string(),
  enviadoPorNome: z.string(),

  /** O que a farmácia vai manipular, resumido para a fila. */
  formulacoes: z.array(
    z.object({
      forma: z.string(),
      quantidade: z.int(),
      aroma: z.string().nullable(),
      usoContinuo: z.boolean(),
      itens: z.array(z.object({ descricao: z.string(), doseMg: z.number() })),
    }),
  ),
  valorTotalEmCentavos: z.int().nonnegative(),

  criadoEm: z.iso.datetime(),
  producaoEm: z.iso.datetime().nullable(),
  prontoEm: z.iso.datetime().nullable(),
  entregueEm: z.iso.datetime().nullable(),
});
export class PedidoDto extends createZodDto(pedidoSchema) {}

export class ListaDePedidosDto extends createZodDto(z.object({ pedidos: z.array(pedidoSchema) })) {}

export const filtroDePedidosSchema = z.object({
  estado: z.enum(ESTADOS_DO_PEDIDO).optional(),
  /** Os pedidos de uma receita, para a tela dela saber o que já foi enviado. */
  receitaId: z.uuid().optional(),
  /** `true` traz só o que ainda anda — o que a bancada precisa ver. */
  emAberto: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export class FiltroDePedidosDto extends createZodDto(filtroDePedidosSchema) {}
