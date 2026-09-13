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
  /**
   * Desligado da instalação. Diferente de `bloqueado`: bloqueio é temporário e
   * automático, por senha errada demais; desativado é decisão de alguém, e não
   * vence sozinho.
   *
   * Quem foi desativado continua na lista, como a clínica suspensa: sumir da
   * tela seria indistinguível de nunca ter existido, e quem procura por que
   * alguém parou de entrar precisa achar a pessoa.
   */
  desativado: z.boolean(),
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

/**
 * O que a administração corrige numa conta.
 *
 * O e-mail fica de fora de propósito: ele é a identidade de login, e trocá-lo é
 * trocar quem entra naquela conta. Um e-mail digitado errado deixa a conta
 * inalcançável desde o primeiro dia — o caminho é desativá-la e criar a certa,
 * que deixa rastro de duas contas em vez de uma que mudou de dono em silêncio.
 *
 * Senha também não: trocar a senha de outra pessoa é outra operação, com outro
 * risco, e não cabe no mesmo formulário que conserta um nome.
 */
export const alterarUsuarioSchema = z.object({
  nome: z.string().min(2, 'Informe o nome.').max(160).optional(),
  papel: z.enum(['ADMIN', 'VETERINARIO', 'FARMACIA', 'CLINICA']).optional(),
  crmv: z.string().max(40).nullable().optional(),
  /** `true` desliga a conta; `false` religa. Ver `usuarioSchema.desativado`. */
  desativado: z.boolean().optional(),
});
export class AlterarUsuarioDto extends createZodDto(alterarUsuarioSchema) {}
