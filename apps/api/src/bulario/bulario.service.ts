import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Especie, type FormulacaoDoBulario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Teto da lista.
 *
 * São 315 formulações no total, então este número quase nunca corta. Ele existe
 * para o dia em que a farmácia dobrar o bulário e ninguém se lembrar de paginar
 * — e a tela diz quando cortou, junto com o total.
 */
const TETO = 50;

export type Filtro = { busca?: string; linhaTerapeutica?: string; especie?: Especie };

/**
 * Busca no bulário magistral.
 *
 * Referência de leitura: aqui não há preço, escopo por clínica nem nada que
 * dependa de quem está perguntando. A ADR 0015 explica por que o bulário é
 * separado do catálogo.
 */
@Injectable()
export class BularioService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: Filtro): Promise<{ formulacoes: FormulacaoDoBulario[]; total: number }> {
    const where = this.onde(filtro);

    // As duas na mesma ida: o total sem a lista seria uma segunda viagem para
    // dizer um número que a mesma consulta já sabe.
    const [formulacoes, total] = await this.prisma.$transaction([
      this.prisma.formulacaoDoBulario.findMany({
        where,
        orderBy: [{ linhaTerapeutica: 'asc' }, { numero: 'asc' }],
        take: TETO,
      }),
      this.prisma.formulacaoDoBulario.count({ where }),
    ]);

    return { formulacoes, total };
  }

  async achar(id: string): Promise<FormulacaoDoBulario> {
    const formulacao = await this.prisma.formulacaoDoBulario.findUnique({ where: { id } });
    if (!formulacao) throw new NotFoundException('Formulação não encontrada.');

    return formulacao;
  }

  /** As linhas terapêuticas, com quantas formulações cada uma tem. */
  async linhas(): Promise<{ nome: string; quantidade: number }[]> {
    const agrupado = await this.prisma.formulacaoDoBulario.groupBy({
      by: ['linhaTerapeutica'],
      _count: { _all: true },
      orderBy: { linhaTerapeutica: 'asc' },
    });

    return agrupado.map((l) => ({ nome: l.linhaTerapeutica, quantidade: l._count._all }));
  }

  /**
   * Os filtros combinados.
   *
   * Tudo dentro de um `AND` de propósito: espécie e busca precisam cada uma do
   * seu `OR`, e dois `OR` soltos no mesmo objeto não se somam — o segundo
   * sobrescreve o primeiro em silêncio, e a busca passaria a ignorar a espécie.
   */
  private onde(filtro: Filtro): Prisma.FormulacaoDoBularioWhereInput {
    const termo = filtro.busca?.trim();
    const clausulas: Prisma.FormulacaoDoBularioWhereInput[] = [];

    if (filtro.linhaTerapeutica) {
      clausulas.push({ linhaTerapeutica: filtro.linhaTerapeutica });
    }

    // Espécie vazia é "o guia não disse", e 164 das 315 não dizem porque valem
    // para mais de uma. Filtrar por CANINO não pode esconder a formulação que
    // serve a cão e a gato sem declarar nenhum dos dois.
    if (filtro.especie) {
      clausulas.push({
        OR: [{ especies: { has: filtro.especie } }, { especies: { isEmpty: true } }],
      });
    }

    // Título, indicação e composição juntos: quem pergunta "otite" não sabe que
    // a resposta está na indicação, e quem pergunta "cetoconazol" não sabe que
    // está na composição.
    if (termo) {
      clausulas.push({
        OR: [
          { titulo: { contains: termo, mode: 'insensitive' } },
          { indicacao: { contains: termo, mode: 'insensitive' } },
          { composicao: { contains: termo, mode: 'insensitive' } },
        ],
      });
    }

    return clausulas.length > 0 ? { AND: clausulas } : {};
  }
}
