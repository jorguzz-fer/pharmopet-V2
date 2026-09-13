import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Mínimo de 12 caracteres, sem exigência de símbolo ou maiúscula.
 *
 * É o que o NIST recomenda hoje e o contrário do que a maioria dos sistemas faz:
 * regra de composição empurra a pessoa para "Senha@2026", que é curta em entropia
 * real e fácil de adivinhar. Comprimento é o que de fato encarece o ataque.
 */
const senhaSchema = z
  .string()
  .min(12, 'A senha precisa de pelo menos 12 caracteres.')
  .max(200, 'Senha longa demais.');

export const entrarSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});
export class EntrarDto extends createZodDto(entrarSchema) {}

export const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    senhaNova: senhaSchema,
  })
  .refine((v) => v.senhaAtual !== v.senhaNova, {
    message: 'A nova senha precisa ser diferente da atual.',
    path: ['senhaNova'],
  });
export class TrocarSenhaDto extends createZodDto(trocarSenhaSchema) {}

/**
 * Quem está logado.
 *
 * Nunca inclui hash, token ou dado de bloqueio: é isto que a tela recebe, e o
 * que a tela recebe é público para quem abrir o inspetor do navegador.
 */
export const euSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.email(),
  papel: z.enum(['ADMIN', 'VETERINARIO', 'FARMACIA', 'CLINICA']),
  crmv: z.string().nullable(),
});
export class EuDto extends createZodDto(euSchema) {}

/**
 * Alguém da equipe, na visão de quem administra.
 *
 * Estende o `euSchema` com só o que uma lista precisa: se a conta está
 * bloqueada, e desde quando existe. Nada de hash, token ou contagem de
 * tentativas — a lista não usa, e o que a tela recebe é público para quem
 * abrir o inspetor do navegador.
 */
export const usuarioSchema = euSchema.extend({
  bloqueado: z.boolean(),
  criadoEm: z.iso.datetime(),
});
export class ListaDeUsuariosDto extends createZodDto(
  z.object({ usuarios: z.array(usuarioSchema) }),
) {}

export const filtroDeUsuariosSchema = z.object({
  papel: z.enum(['ADMIN', 'VETERINARIO', 'FARMACIA', 'CLINICA']).optional(),
  /** Casa com pedaço do nome ou do e-mail, sem diferenciar maiúsculas. */
  busca: z.string().trim().max(160).optional(),
});
export class FiltroDeUsuariosDto extends createZodDto(filtroDeUsuariosSchema) {}

export const criarUsuarioSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  nome: z.string().min(2, 'Informe o nome.').max(160),
  papel: z.enum(['ADMIN', 'VETERINARIO', 'FARMACIA', 'CLINICA']),
  senha: senhaSchema,
  crmv: z.string().max(40).nullable().optional(),
});
export class CriarUsuarioDto extends createZodDto(criarUsuarioSchema) {}
