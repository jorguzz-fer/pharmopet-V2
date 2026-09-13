import { AROMAS, cpfValido, normalizarTelefone } from '@pharmopet/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { doseMgSchema } from '../catalogo/catalogo.dto';

/**
 * Entradas e saídas do receituário.
 *
 * A conferência de CPF e de telefone vem de `@pharmopet/shared`, a mesma que a
 * tela usa antes de enviar. Duas implementações da mesma regra divergem, e a
 * que diverge em silêncio é sempre a do servidor.
 */

const especieSchema = z.enum(['CANINO', 'FELINO', 'EQUINO', 'AVE', 'ROEDOR', 'REPTIL']);

/** Texto opcional que chega vazio da tela e deve virar ausência, não string vazia. */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

const cpfSchema = z
  .string()
  .refine(cpfValido, 'CPF inválido — confira os dígitos.')
  .transform((v) => v.replace(/\D/g, ''));

const telefoneSchema = z
  .string()
  .refine((v) => normalizarTelefone(v) !== null, 'Telefone inválido — informe com DDD.')
  .transform((v) => normalizarTelefone(v)!);

// --- Tutor ---

export const criarTutorSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do tutor.').max(120),
  cpf: cpfSchema.nullable().optional(),
  email: z.email('E-mail inválido.').max(160).nullable().optional(),
  telefone: telefoneSchema.nullable().optional(),
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
  observacoes: textoOpcional(1_000),
});
export class CriarTutorDto extends createZodDto(criarTutorSchema) {}

/** Alteração é parcial: mandar a ficha inteira para corrigir um telefone apagaria o resto. */
export const alterarTutorSchema = criarTutorSchema.partial();
export class AlterarTutorDto extends createZodDto(alterarTutorSchema) {}

export const tutorSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  cpf: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  cep: z.string().nullable(),
  logradouro: z.string().nullable(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  observacoes: z.string().nullable(),
  quantidadeDePacientes: z.int().nonnegative(),
});
export class TutorDto extends createZodDto(tutorSchema) {}
export class ListaDeTutoresDto extends createZodDto(z.object({ tutores: z.array(tutorSchema) })) {}

// --- Paciente ---

/**
 * Dois milhões de gramas é o teto: duas toneladas cobre o maior equino que uma
 * farmácia magistral atende, e barra o erro de digitar quilos no campo de
 * gramas — 30 viraria 30 g, e um cão de 30 kg receberia mil vezes menos.
 */
const pesoEmGramasSchema = z
  .number()
  .int('O peso é em gramas inteiros.')
  .positive()
  .max(2_000_000, 'Peso acima do que a farmácia atende — confira a unidade.');

export const criarPacienteSchema = z.object({
  tutorId: z.uuid(),
  nome: z.string().trim().min(1, 'Informe o nome do paciente.').max(80),
  especie: especieSchema,
  raca: textoOpcional(80),
  sexo: z.enum(['MACHO', 'FEMEA']).nullable().optional(),
  castrado: z.boolean().optional(),
  pesoEmGramas: pesoEmGramasSchema.nullable().optional(),
  nascimentoEm: z.iso.date().nullable().optional(),
  observacoes: textoOpcional(1_000),
});
export class CriarPacienteDto extends createZodDto(criarPacienteSchema) {}

export const alterarPacienteSchema = criarPacienteSchema.omit({ tutorId: true }).partial();
export class AlterarPacienteDto extends createZodDto(alterarPacienteSchema) {}

export const pacienteSchema = z.object({
  id: z.uuid(),
  tutorId: z.uuid(),
  tutorNome: z.string(),
  nome: z.string(),
  especie: especieSchema,
  raca: z.string().nullable(),
  sexo: z.enum(['MACHO', 'FEMEA']).nullable(),
  castrado: z.boolean(),
  pesoEmGramas: z.int().nullable(),
  /** Quando o peso foi aferido. Peso sem data não serve para dosar. */
  pesoAferidoEm: z.iso.datetime().nullable(),
  nascimentoEm: z.iso.date().nullable(),
  observacoes: z.string().nullable(),
  obito: z.boolean(),
});
export class PacienteDto extends createZodDto(pacienteSchema) {}
export class ListaDePacientesDto extends createZodDto(
  z.object({ pacientes: z.array(pacienteSchema) }),
) {}

// --- Receita ---

export const formulacaoEntradaSchema = z.object({
  formaId: z.uuid(),
  /** Os mesmos intervalos que `calcularPosologia` aceita. */
  frequenciaHoras: z.union([z.literal(24), z.literal(12), z.literal(8), z.literal(6)]),
  dias: z.number().int().positive().max(365, 'Tratamento acima de um ano — confira.'),
  /**
   * Quantas unidades manipular. Ausente, sai da posologia (dias × doses/dia).
   * Existe para o veterinário arredondar para cima — "faça 30 cápsulas".
   */
  quantidade: z.number().int().positive().max(1_000).optional(),
  orientacao: textoOpcional(500),
  /**
   * O sabor. A API confere contra a forma escolhida: obrigatório quando ela
   * aceita aroma, recusado quando não aceita.
   */
  aroma: z.enum(AROMAS).nullable().optional(),
  usoContinuo: z.boolean().optional(),
  itens: z
    .array(z.object({ insumoId: z.uuid(), doseMg: doseMgSchema }))
    .min(1, 'A fórmula precisa de pelo menos um insumo.')
    .max(20),
});

export const salvarReceitaSchema = z.object({
  pacienteId: z.uuid(),
  /**
   * A clínica que pediu a receita. Nula quando o veterinário atende por conta
   * própria — aí o documento sai no nome da farmácia (ADR 0012).
   */
  clinicaId: z.uuid().nullable().optional(),
  observacoes: textoOpcional(2_000),
  formulacoes: z
    .array(formulacaoEntradaSchema)
    .min(1, 'A receita precisa de pelo menos uma fórmula.')
    .max(10),
});
export class SalvarReceitaDto extends createZodDto(salvarReceitaSchema) {}

export const cancelarReceitaSchema = z.object({
  /**
   * Obrigatório. Cancelamento sem motivo registrado é o mesmo que apagar, e
   * apagar receita emitida é o que este modelo existe para impedir.
   */
  motivo: z.string().trim().min(3, 'Diga por que a receita está sendo cancelada.').max(500),
});
export class CancelarReceitaDto extends createZodDto(cancelarReceitaSchema) {}

const avisoSchema = z.object({
  tipo: z.enum([
    'sem-estoque',
    'controlado',
    'antimicrobiano',
    'fora-da-faixa',
    'sem-referencia',
    'duracao-acima',
  ]),
  insumoId: z.uuid().nullable(),
  texto: z.string(),
});

const formulacaoSchema = z.object({
  id: z.uuid(),
  formaId: z.uuid(),
  forma: z.string(),
  frequenciaHoras: z.int(),
  dias: z.int(),
  quantidade: z.int(),
  orientacao: z.string().nullable(),
  aroma: z.enum(AROMAS).nullable(),
  usoContinuo: z.boolean(),
  /**
   * No rascunho é cotação de agora; na emitida é o valor congelado. Só o total:
   * a composição do preço continua restrita a ADMIN e FARMACIA, como na fase 3.
   */
  valorEmCentavos: z.int().nonnegative().nullable(),
  itens: z.array(
    z.object({
      insumoId: z.uuid(),
      codigo: z.string(),
      descricao: z.string(),
      doseMg: z.number(),
      listaDeControle: z.string().nullable(),
    }),
  ),
  avisos: z.array(avisoSchema),
  impedimentos: z.array(z.object({ insumoId: z.uuid().nullable(), texto: z.string() })),
});

export const receitaSchema = z.object({
  id: z.uuid(),
  numero: z.int().nullable(),
  estado: z.enum(['RASCUNHO', 'EMITIDA', 'CANCELADA']),
  /** O estado já contado o relógio: rascunho, válida, vencida ou cancelada. */
  situacao: z.enum(['rascunho', 'valida', 'vencida', 'cancelada']),
  veterinarioId: z.uuid(),
  veterinarioNome: z.string(),
  crmv: z.string().nullable(),
  pacienteId: z.uuid(),
  pacienteNome: z.string(),
  tutorNome: z.string(),
  clinicaId: z.uuid().nullable(),
  /** Congelado na emissão. Nulo quando a receita saiu no nome da farmácia. */
  clinicaNome: z.string().nullable(),
  clinicaCnpj: z.string().nullable(),
  /** O peso contra o qual a dose foi conferida. Congelado na emissão. */
  pesoDoPacienteEmGramas: z.int().nullable(),
  emitidaEm: z.iso.datetime().nullable(),
  validaAte: z.iso.datetime().nullable(),
  prazoEmDias: z.int().nullable(),
  prazoMotivo: z.string().nullable(),
  canceladaEm: z.iso.datetime().nullable(),
  motivoDoCancelamento: z.string().nullable(),
  observacoes: z.string().nullable(),
  /**
   * O segredo que abre a receita sem login. Nulo enquanto é rascunho.
   *
   * Vai só aqui, na receita inteira, e nunca na listagem: quem abre a ficha já
   * podia ver esta receita, e uma listagem carregaria dezenas de links de uma
   * vez para uma tela que não usa nenhum.
   */
  tokenPublico: z.string().nullable(),
  formulacoes: z.array(formulacaoSchema),
  valorTotalEmCentavos: z.int().nonnegative(),
  criadaEm: z.iso.datetime(),
});
export class ReceitaDto extends createZodDto(receitaSchema) {}

/** A lista não carrega as fórmulas: quem lista quer achar, não conferir. */
export const receitaResumidaSchema = receitaSchema.pick({
  id: true,
  numero: true,
  estado: true,
  situacao: true,
  pacienteNome: true,
  tutorNome: true,
  veterinarioNome: true,
  emitidaEm: true,
  validaAte: true,
  criadaEm: true,
});
export class ListaDeReceitasDto extends createZodDto(
  z.object({ receitas: z.array(receitaResumidaSchema) }),
) {}
