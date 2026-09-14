import { Injectable } from '@nestjs/common';
import type { EstadoDaReceita } from '@prisma/client';
import { ClinicasService } from '../clinicas/clinicas.service';
import { PrismaService } from '../prisma/prisma.service';
import { escopoDeReceita, veTudo, type Ator } from '../receituario/escopo';

/** Quantos dias contam como "vence logo". Uma semana é o horizonte de quem repõe. */
const DIAS_DE_AVISO = 7;

/** Quantas receitas recentes o painel lista. Cabe na tela sem rolar. */
const ULTIMAS = 8;

/**
 * Os estados que formam a fila, na ordem em que o trabalho anda.
 *
 * Entregue e cancelado ficam de fora: a fila é o que falta fazer, e um
 * contador que só cresce com o histórico deixa de ser fila.
 */
export const DEGRAUS_DA_FILA = ['EM_ANALISE', 'EM_PRODUCAO', 'PRONTO'] as const;

export type Painel = {
  rascunhos: number;
  emitidasNoMes: number;
  vencendo: number;
  valorPrescritoNoMesEmCentavos: number;
  fila: { estado: (typeof DEGRAUS_DA_FILA)[number]; quantidade: number }[] | null;
  topVeterinarios: { id: string; nome: string; crmv: string | null; receitas: number }[] | null;
  ultimas: {
    id: string;
    numero: number | null;
    pacienteNome: string;
    tutorNome: string;
    estado: EstadoDaReceita;
    criadaEm: Date;
  }[];
};

/**
 * O painel (ADR 0017).
 *
 * Um serviço só para os três painéis da v1, e o recorte por papel vem de
 * `escopoDeReceita` — o mesmo filtro da listagem de receitas. Escrever um
 * segundo filtro aqui seria um segundo lugar para a regra de visibilidade
 * divergir, e a divergência apareceria como um veterinário vendo um total
 * maior do que a lista dele mostra: vazamento de carteira disfarçado de
 * métrica.
 */
@Injectable()
export class PainelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicas: ClinicasService,
  ) {}

  async montar(ator: Ator): Promise<Painel> {
    const escopo = escopoDeReceita(ator, await this.clinicasDe(ator));
    const agora = new Date();
    const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const limiteDoAviso = new Date(agora.getTime() + DIAS_DE_AVISO * 24 * 60 * 60 * 1000);

    const [rascunhos, emitidasNoMes, vencendo, valor, ultimas] = await Promise.all([
      this.prisma.receita.count({ where: { ...escopo, estado: 'RASCUNHO' } }),

      this.prisma.receita.count({
        where: { ...escopo, estado: 'EMITIDA', emitidaEm: { gte: inicioDoMes } },
      }),

      // Vence nos próximos dias e ainda vale. `gte: agora` tira as já vencidas,
      // que não são aviso — são histórico.
      this.prisma.receita.count({
        where: {
          ...escopo,
          estado: 'EMITIDA',
          validaAte: { gte: agora, lte: limiteDoAviso },
        },
      }),

      // Só de receita emitida: rascunho tem preço de cotação, e cotação muda.
      // Somar rascunho seria o erro da v1, que chamava de faturamento a soma
      // de todo orçamento criado — inclusive o que ninguém pagou.
      this.prisma.formulacao.aggregate({
        where: {
          receita: { ...escopo, estado: 'EMITIDA', emitidaEm: { gte: inicioDoMes } },
        },
        _sum: { valorEmCentavos: true },
      }),

      this.prisma.receita.findMany({
        where: escopo,
        orderBy: { criadaEm: 'desc' },
        take: ULTIMAS,
        select: {
          id: true,
          numero: true,
          estado: true,
          criadaEm: true,
          paciente: { select: { nome: true, tutor: { select: { nome: true } } } },
        },
      }),
    ]);

    return {
      rascunhos,
      emitidasNoMes,
      vencendo,
      valorPrescritoNoMesEmCentavos: valor._sum.valorEmCentavos ?? 0,
      // Os dois blocos abaixo são nulos — e não listas vazias — para quem não
      // os vê. Lista vazia diria "não há nenhum"; nulo diz "não é para você",
      // e a tela precisa dessa diferença para não desenhar um bloco vazio.
      fila: veTudo(ator) ? await this.fila() : null,
      topVeterinarios: veTudo(ator) ? await this.topVeterinarios(inicioDoMes) : null,
      ultimas: ultimas.map((r) => ({
        id: r.id,
        numero: r.numero,
        pacienteNome: r.paciente.nome,
        tutorNome: r.paciente.tutor.nome,
        estado: r.estado,
        criadaEm: r.criadaEm,
      })),
    };
  }

  private async clinicasDe(ator: Ator): Promise<string[]> {
    return veTudo(ator) ? [] : this.clinicas.idsVisiveis(ator.id);
  }

  /**
   * A fila da farmácia, por estado.
   *
   * Sem os já entregues e os cancelados: a fila é o que falta fazer, e um
   * contador que só cresce com o histórico deixa de ser fila.
   */
  private async fila(): Promise<NonNullable<Painel['fila']>> {
    const grupos = await this.prisma.pedido.groupBy({
      by: ['estado'],
      where: { estado: { in: [...DEGRAUS_DA_FILA] } },
      _count: { id: true },
    });

    // A ordem vem da constante, e não do banco: ela é a ordem em que o
    // trabalho anda, e isso não sai de um `groupBy`. Estado sem nenhum pedido
    // aparece zerado — sumir faria a fila mudar de forma a cada carga.
    return DEGRAUS_DA_FILA.map((estado) => ({
      estado,
      quantidade: grupos.find((g) => g.estado === estado)?._count.id ?? 0,
    }));
  }

  /** Quem mais prescreveu no mês. Só para quem vê tudo (ADR 0017). */
  private async topVeterinarios(
    desde: Date,
  ): Promise<{ id: string; nome: string; crmv: string | null; receitas: number }[]> {
    const grupos = await this.prisma.receita.groupBy({
      by: ['veterinarioId'],
      where: { estado: 'EMITIDA', emitidaEm: { gte: desde } },
      _count: { id: true },
      orderBy: { _count: { veterinarioId: 'desc' } },
      take: 5,
    });

    if (grupos.length === 0) return [];

    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: grupos.map((g) => g.veterinarioId) } },
      select: { id: true, nome: true, crmv: true },
    });

    // O `map` sobre `grupos` preserva a ordem do ranking; buscar pelos ids e
    // devolver o que o banco entregar perderia a ordenação por contagem.
    return grupos.flatMap((g) => {
      const usuario = usuarios.find((u) => u.id === g.veterinarioId);
      // Conta apagada não vira linha "Desconhecido": o nome é o ponto do
      // bloco, e uma linha sem nome só ocupa espaço.
      return usuario
        ? [{ id: usuario.id, nome: usuario.nome, crmv: usuario.crmv, receitas: g._count.id }]
        : [];
    });
  }
}
