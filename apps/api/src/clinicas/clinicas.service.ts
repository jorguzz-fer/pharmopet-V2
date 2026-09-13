import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Clinica, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LOGOTIPO_MAXIMO_EM_BYTES } from './clinicas.dto';

export type Ator = { id: string; papel: string };

type ClinicaComContagem = Clinica & { _count: { usuarios: number } };

/**
 * Clínicas parceiras.
 *
 * Quem administra vê e mexe em todas; quem atende vê só aquelas a que está
 * vinculado. O vínculo é a chave de tudo aqui — é por ele que o preço, o
 * logotipo e o escopo da clientela se resolvem.
 */
@Injectable()
export class ClinicasService {
  constructor(private readonly prisma: PrismaService) {}

  /** As clínicas a que a pessoa está vinculada, e que estão ativas. */
  async idsVisiveis(usuarioId: string): Promise<string[]> {
    const vinculos = await this.prisma.clinicaUsuario.findMany({
      where: { usuarioId, encerradoEm: null, clinica: { situacao: 'ATIVA' } },
      select: { clinicaId: true },
    });

    return vinculos.map((v) => v.clinicaId);
  }

  async listar(ator: Ator): Promise<ClinicaComContagem[]> {
    const where: Prisma.ClinicaWhereInput =
      ator.papel === 'ADMIN' || ator.papel === 'FARMACIA'
        ? {}
        : { id: { in: await this.idsVisiveis(ator.id) } };

    return this.prisma.clinica.findMany({
      where,
      include: { _count: { select: { usuarios: true } } },
      orderBy: { nomeFantasia: 'asc' },
      take: 100,
    });
  }

  async achar(id: string, ator: Ator): Promise<ClinicaComContagem> {
    const visiveis =
      ator.papel === 'ADMIN' || ator.papel === 'FARMACIA' ? null : await this.idsVisiveis(ator.id);

    if (visiveis !== null && !visiveis.includes(id)) {
      // 404, e não 403: a existência de uma clínica parceira já é informação
      // comercial. Mesma regra da ADR 0011.
      throw new NotFoundException('Clínica não encontrada.');
    }

    const clinica = await this.prisma.clinica.findUnique({
      where: { id },
      include: { _count: { select: { usuarios: true } } },
    });

    if (!clinica) throw new NotFoundException('Clínica não encontrada.');

    return clinica;
  }

  async criar(dados: Prisma.ClinicaCreateInput): Promise<ClinicaComContagem> {
    await this.recusarCnpjRepetido(dados.cnpj, null);

    return this.prisma.clinica.create({
      data: dados,
      include: { _count: { select: { usuarios: true } } },
    });
  }

  async alterar(id: string, dados: Prisma.ClinicaUpdateInput): Promise<ClinicaComContagem> {
    if (typeof dados.cnpj === 'string') await this.recusarCnpjRepetido(dados.cnpj, id);

    const existe = await this.prisma.clinica.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new NotFoundException('Clínica não encontrada.');

    return this.prisma.clinica.update({
      where: { id },
      data: dados,
      include: { _count: { select: { usuarios: true } } },
    });
  }

  /**
   * O índice único já barraria, mas com violação de constraint que chega como
   * erro 500. A conferência antes existe para a resposta explicar.
   */
  private async recusarCnpjRepetido(cnpj: string, exceto: string | null): Promise<void> {
    const existente = await this.prisma.clinica.findUnique({ where: { cnpj } });

    if (existente && existente.id !== exceto) {
      throw new ConflictException('Já existe uma clínica com este CNPJ.');
    }
  }

  // --- logotipo ---

  async gravarLogotipo(id: string, tipo: string, conteudoBase64: string): Promise<void> {
    const bytes = Buffer.from(conteudoBase64, 'base64');

    // `Buffer.from` não reclama de base64 inválido: ignora o que não reconhece
    // e devolve o que deu. Um conteúdo vazio aqui é entrada malformada, não
    // arquivo vazio, e gravar isso deixaria a clínica com um logotipo quebrado.
    if (bytes.length === 0) {
      throw new BadRequestException('Conteúdo do logotipo inválido.');
    }

    if (bytes.length > LOGOTIPO_MAXIMO_EM_BYTES) {
      throw new BadRequestException('Logotipo acima de 512 KB.');
    }

    const existe = await this.prisma.clinica.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new NotFoundException('Clínica não encontrada.');

    await this.prisma.clinica.update({
      where: { id },
      data: { logotipo: bytes, logotipoTipo: tipo },
    });
  }

  async lerLogotipo(id: string): Promise<{ bytes: Buffer; tipo: string }> {
    const clinica = await this.prisma.clinica.findUnique({
      where: { id },
      select: { logotipo: true, logotipoTipo: true },
    });

    if (!clinica?.logotipo || !clinica.logotipoTipo) {
      throw new NotFoundException('Esta clínica não tem logotipo.');
    }

    return { bytes: Buffer.from(clinica.logotipo), tipo: clinica.logotipoTipo };
  }

  // --- vínculos ---

  async vincular(clinicaId: string, usuarioId: string, cargo: string | null): Promise<void> {
    const [clinica, usuario] = await Promise.all([
      this.prisma.clinica.findUnique({ where: { id: clinicaId }, select: { id: true } }),
      this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { id: true, desativadoEm: true },
      }),
    ]);

    if (!clinica) throw new NotFoundException('Clínica não encontrada.');
    if (!usuario || usuario.desativadoEm !== null) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // Reativa em vez de duplicar: o par é único, e um vínculo encerrado que
    // volta é a mesma relação de novo, não uma segunda.
    await this.prisma.clinicaUsuario.upsert({
      where: { clinicaId_usuarioId: { clinicaId, usuarioId } },
      update: { encerradoEm: null, cargo },
      create: { clinicaId, usuarioId, cargo },
    });
  }

  async desvincular(clinicaId: string, usuarioId: string): Promise<void> {
    // Encerra, não apaga: as receitas emitidas sob este vínculo precisam
    // continuar fazendo sentido.
    await this.prisma.clinicaUsuario.updateMany({
      where: { clinicaId, usuarioId, encerradoEm: null },
      data: { encerradoEm: new Date() },
    });
  }

  async vinculos(clinicaId: string) {
    return this.prisma.clinicaUsuario.findMany({
      where: { clinicaId, encerradoEm: null },
      include: {
        usuario: { select: { id: true, nome: true, email: true, papel: true, crmv: true } },
      },
      orderBy: { criadoEm: 'asc' },
    });
  }
}
