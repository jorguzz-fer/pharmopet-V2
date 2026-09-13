import { cnpjValido, normalizarTelefone } from '@pharmopet/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Cadastro de clínica parceira.
 *
 * A ADR 0012 explica por que ela existe: o logotipo da receita vem daqui, e o
 * preço depende do acordo desta clínica.
 */

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

const cnpjSchema = z
  .string()
  .refine(cnpjValido, 'CNPJ inválido — confira os dígitos.')
  .transform((v) => v.replace(/\D/g, ''));

const telefoneSchema = z
  .string()
  .refine((v) => normalizarTelefone(v) !== null, 'Telefone inválido — informe com DDD.')
  .transform((v) => normalizarTelefone(v)!);

export const criarClinicaSchema = z.object({
  razaoSocial: z.string().trim().min(2, 'Informe a razão social.').max(160),
  nomeFantasia: z.string().trim().min(2, 'Informe o nome fantasia.').max(120),
  cnpj: cnpjSchema,
  inscricaoEstadual: textoOpcional(40),
  email: z.email('E-mail inválido.').max(160),
  telefone: telefoneSchema.nullable().optional(),
  whatsapp: telefoneSchema.nullable().optional(),
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 8, 'CEP precisa de oito dígitos.')
    .nullable()
    .optional(),
  logradouro: textoOpcional(160),
  numero: textoOpcional(20),
  complemento: textoOpcional(80),
  bairro: textoOpcional(80),
  cidade: textoOpcional(80),
  uf: z.string().trim().toUpperCase().length(2, 'UF tem duas letras.').nullable().optional(),
  responsavelLegal: z.string().trim().min(2, 'Informe o responsável legal.').max(120),
  cpfDoResponsavel: textoOpcional(20),
  observacoesInternas: textoOpcional(2_000),
});
export class CriarClinicaDto extends createZodDto(criarClinicaSchema) {}

export const alterarClinicaSchema = criarClinicaSchema.partial().extend({
  situacao: z.enum(['PENDENTE', 'ATIVA', 'SUSPENSA']).optional(),
});
export class AlterarClinicaDto extends createZodDto(alterarClinicaSchema) {}

export const clinicaSchema = z.object({
  id: z.uuid(),
  razaoSocial: z.string(),
  nomeFantasia: z.string(),
  cnpj: z.string(),
  inscricaoEstadual: z.string().nullable(),
  email: z.string(),
  telefone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  cep: z.string().nullable(),
  logradouro: z.string().nullable(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  responsavelLegal: z.string(),
  cpfDoResponsavel: z.string().nullable(),
  situacao: z.enum(['PENDENTE', 'ATIVA', 'SUSPENSA']),
  observacoesInternas: z.string().nullable(),
  /** Se há logotipo. O conteúdo sai pela rota própria, não no JSON. */
  temLogotipo: z.boolean(),
  /**
   * Quando o cadastro mudou pela última vez.
   *
   * A tela usa isto para furar o cache do logotipo: a URL da imagem é sempre a
   * mesma, e sem um parâmetro que mude junto o navegador mostraria o logotipo
   * antigo pelos cinco minutos do `Cache-Control`. Vale para todo mundo que
   * abrir a página, e não só para quem acabou de trocar o arquivo.
   *
   * Muda também numa edição de endereço, que não mexe no logotipo. O custo é
   * uma imagem rebaixada sem necessidade, de vez em quando — barato perto de
   * carregar uma coluna própria só para isso.
   */
  atualizadaEm: z.iso.datetime(),
  quantidadeDeUsuarios: z.int().nonnegative(),
});
export class ClinicaDto extends createZodDto(clinicaSchema) {}
export class ListaDeClinicasDto extends createZodDto(
  z.object({ clinicas: z.array(clinicaSchema) }),
) {}

/**
 * Logotipo por JSON em base64, e não por multipart.
 *
 * Multipart obrigaria a mexer no pipe de validação, a trazer os tipos do
 * multer e a descrever o corpo à mão no OpenAPI — o cliente gerado não lida
 * bem com ele. Base64 custa um terço a mais de bytes numa imagem de dezenas de
 * quilobytes, o que é irrelevante, e mantém o contrato tipado de ponta a ponta.
 */
export const LOGOTIPO_MAXIMO_EM_BYTES = 512 * 1024;

export const enviarLogotipoSchema = z.object({
  tipo: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  conteudoBase64: z
    .string()
    .min(1, 'Envie o conteúdo do arquivo.')
    // O base64 cresce 4/3; o teto aqui é sobre o texto, para recusar antes de
    // decodificar em vez de alocar meio megabyte para então descobrir o excesso.
    .max(Math.ceil((LOGOTIPO_MAXIMO_EM_BYTES * 4) / 3) + 16, 'Logotipo acima de 512 KB.'),
});
export class EnviarLogotipoDto extends createZodDto(enviarLogotipoSchema) {}

export const vincularSchema = z.object({
  usuarioId: z.uuid(),
  cargo: textoOpcional(80),
});
export class VincularDto extends createZodDto(vincularSchema) {}

export const vinculoSchema = z.object({
  usuarioId: z.uuid(),
  nome: z.string(),
  email: z.string(),
  papel: z.enum(['ADMIN', 'VETERINARIO', 'FARMACIA', 'CLINICA']),
  crmv: z.string().nullable(),
  cargo: z.string().nullable(),
});
export class ListaDeVinculosDto extends createZodDto(
  z.object({ vinculos: z.array(vinculoSchema) }),
) {}
