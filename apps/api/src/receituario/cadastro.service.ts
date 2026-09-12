import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Paciente, Prisma, Tutor } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { escopoDePaciente, escopoDeTutor, type Ator } from './escopo';

type TutorComContagem = Tutor & { _count: { pacientes: number } };
type PacienteComTutor = Paciente & { tutor: { id: string; nome: string } };

/**
 * Tutores e pacientes.
 *
 * Nada é apagado: `desativadoEm` no tutor e `obitoEm` no paciente. Receita
 * assinada aponta para o paciente, e um paciente excluído deixaria a receita
 * sem a quem se referir — que é exatamente o documento que precisa sobreviver.
 */
@Injectable()
export class CadastroService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Tutor ---

  async criarTutor(
    dados: Omit<Prisma.TutorCreateInput, 'cadastradoPor'>,
    ator: Ator,
  ): Promise<TutorComContagem> {
    await this.recusarCpfRepetido(dados.cpf ?? null, null);

    return this.prisma.tutor.create({
      data: { ...dados, cadastradoPor: { connect: { id: ator.id } } },
      include: { _count: { select: { pacientes: true } } },
    });
  }

  async listarTutores(busca: string | undefined, ator: Ator): Promise<TutorComContagem[]> {
    const termo = busca?.trim();

    return this.prisma.tutor.findMany({
      where: {
        ...escopoDeTutor(ator),
        desativadoEm: null,
        ...(termo
          ? {
              OR: [
                { nome: { contains: termo, mode: 'insensitive' } },
                // Busca por CPF funciona com ou sem máscara: quem digita
                // "123.456" não deveria receber zero resultado por causa dos
                // pontos que a própria tela pôs.
                { cpf: { contains: termo.replace(/\D/g, '') || termo } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { pacientes: true } } },
      orderBy: { nome: 'asc' },
      take: 50,
    });
  }

  async acharTutor(id: string, ator: Ator): Promise<TutorComContagem> {
    const tutor = await this.prisma.tutor.findFirst({
      where: { id, ...escopoDeTutor(ator), desativadoEm: null },
      include: { _count: { select: { pacientes: true } } },
    });

    // 404, e não 403: responder "existe mas não é seu" já entrega que aquele
    // tutor existe, e para quem procura uma clientela isso é o suficiente.
    if (!tutor) throw new NotFoundException('Tutor não encontrado.');

    return tutor;
  }

  async alterarTutor(
    id: string,
    dados: Prisma.TutorUpdateInput,
    ator: Ator,
  ): Promise<TutorComContagem> {
    await this.acharTutor(id, ator);

    if (typeof dados.cpf === 'string') {
      await this.recusarCpfRepetido(dados.cpf, id);
    }

    return this.prisma.tutor.update({
      where: { id },
      data: dados,
      include: { _count: { select: { pacientes: true } } },
    });
  }

  /**
   * O índice único do banco já barraria, mas com uma violação de constraint que
   * chega ao usuário como erro 500. A conferência antes existe para a resposta
   * dizer o que aconteceu; o índice continua sendo a garantia.
   */
  private async recusarCpfRepetido(cpf: string | null, exceto: string | null): Promise<void> {
    if (!cpf) return;

    const existente = await this.prisma.tutor.findUnique({ where: { cpf } });
    if (existente && existente.id !== exceto) {
      throw new ConflictException('Já existe um tutor com este CPF.');
    }
  }

  // --- Paciente ---

  async criarPaciente(
    dados: Omit<Prisma.PacienteUncheckedCreateInput, 'tutorId'> & { tutorId: string },
    ator: Ator,
  ): Promise<PacienteComTutor> {
    // Pelo escopo: sem isto, informar o id de um tutor alheio criaria um
    // paciente dentro da ficha de outro veterinário.
    await this.acharTutor(dados.tutorId, ator);

    return this.prisma.paciente.create({
      data: dados,
      include: { tutor: { select: { id: true, nome: true } } },
    });
  }

  async listarPacientes(
    filtro: { tutorId?: string; busca?: string },
    ator: Ator,
  ): Promise<PacienteComTutor[]> {
    const termo = filtro.busca?.trim();

    return this.prisma.paciente.findMany({
      where: {
        ...escopoDePaciente(ator),
        ...(filtro.tutorId ? { tutorId: filtro.tutorId } : {}),
        ...(termo ? { nome: { contains: termo, mode: 'insensitive' } } : {}),
      },
      include: { tutor: { select: { id: true, nome: true } } },
      orderBy: { nome: 'asc' },
      take: 50,
    });
  }

  async acharPaciente(id: string, ator: Ator): Promise<PacienteComTutor> {
    const paciente = await this.prisma.paciente.findFirst({
      where: { id, ...escopoDePaciente(ator) },
      include: { tutor: { select: { id: true, nome: true } } },
    });

    if (!paciente) throw new NotFoundException('Paciente não encontrado.');

    return paciente;
  }

  /**
   * Altera a ficha. Peso novo carimba a data de aferição junto.
   *
   * Peso sem data não se pode usar para dosar — "12 kg" pode ser de ontem ou de
   * dois anos atrás, e em filhote a diferença é enorme. Gravar os dois na mesma
   * escrita é o que impede a data de ficar para trás.
   */
  async alterarPaciente(
    id: string,
    dados: Prisma.PacienteUpdateInput,
    ator: Ator,
  ): Promise<PacienteComTutor> {
    const atual = await this.acharPaciente(id, ator);

    const pesoMudou =
      typeof dados.pesoEmGramas === 'number' && dados.pesoEmGramas !== atual.pesoEmGramas;

    return this.prisma.paciente.update({
      where: { id },
      data: { ...dados, ...(pesoMudou ? { pesoAferidoEm: new Date() } : {}) },
      include: { tutor: { select: { id: true, nome: true } } },
    });
  }
}
