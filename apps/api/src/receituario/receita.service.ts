import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type EstadoDaReceita } from '@prisma/client';
import {
  conferirDuracao,
  descreverDuracao,
  prazoDaReceita,
  quantidadeDeDoses,
  situacaoDaReceita,
  venceEm,
} from '@pharmopet/shared';
import { CatalogoService, type AvisoDoOrcamento } from '../catalogo/catalogo.service';
import { AuditoriaService } from '../identidade/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';
import { escopoDeReceita, type Ator } from './escopo';

/** O que o controller manda; já validado pelo schema. */
export type FormulacaoPedida = {
  formaId: string;
  frequenciaHoras: 24 | 12 | 8 | 6;
  dias: number;
  quantidade?: number;
  orientacao?: string | null;
  itens: { insumoId: string; doseMg: number }[];
};

/**
 * Quem assina. O CRMV entra no tipo porque emitir sem ele não é possível — e
 * um tipo que permite passar sem CRMV convida a esquecer a checagem.
 */
export type Prescritor = Ator & { crmv: string | null };

export type ReceitaPedida = {
  pacienteId: string;
  observacoes?: string | null;
  formulacoes: FormulacaoPedida[];
};

/**
 * Os avisos do orçamento mais o de duração.
 *
 * Duração não é assunto do motor de preço — ele não sabe por quantos dias a
 * fórmula vai ser usada. É a receita que sabe, e por isso a conferência mora
 * aqui.
 */
export type AvisoDaReceita = {
  tipo: AvisoDoOrcamento['tipo'] | 'duracao-acima';
  insumoId: string | null;
  texto: string;
};

export type FormulacaoResolvida = {
  id: string;
  formaId: string;
  forma: string;
  frequenciaHoras: number;
  dias: number;
  quantidade: number;
  orientacao: string | null;
  valorEmCentavos: number | null;
  itens: {
    insumoId: string;
    codigo: string;
    descricao: string;
    doseMg: number;
    listaDeControle: string | null;
  }[];
  avisos: AvisoDaReceita[];
  impedimentos: { insumoId: string | null; texto: string }[];
};

const COM_TUDO = {
  paciente: { include: { tutor: { select: { id: true, nome: true } } } },
  veterinario: { select: { id: true, nome: true, crmv: true } },
  formulacoes: {
    orderBy: { ordem: 'asc' },
    include: {
      forma: { select: { id: true, nome: true } },
      itens: {
        orderBy: { ordem: 'asc' },
        include: { insumo: { select: { id: true, codigo: true, descricao: true, listaDeControle: true } } },
      },
    },
  },
} satisfies Prisma.ReceitaInclude;

type ReceitaCompleta = Prisma.ReceitaGetPayload<{ include: typeof COM_TUDO }>;

/**
 * Receitas.
 *
 * O rascunho é editável e não tem número; a emitida é imutável e tem. Não
 * existe caminho que altere uma receita emitida — nem para "corrigir um
 * detalhe". A correção é cancelar e emitir outra, e o cancelamento exige
 * motivo, porque é isso que deixa o histórico legível depois.
 */
@Injectable()
export class ReceitaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: CatalogoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async criar(pedido: ReceitaPedida, ator: Ator): Promise<ReceitaCompleta> {
    const paciente = await this.pacienteVisivel(pedido.pacienteId, ator);

    const criada = await this.prisma.receita.create({
      data: {
        veterinarioId: ator.id,
        pacienteId: paciente.id,
        observacoes: pedido.observacoes ?? null,
        formulacoes: { create: this.montarFormulacoes(pedido.formulacoes) },
      },
      include: COM_TUDO,
    });

    return criada;
  }

  /** Substitui o conteúdo do rascunho inteiro. Só o autor, e só enquanto rascunho. */
  async salvar(id: string, pedido: ReceitaPedida, ator: Ator): Promise<ReceitaCompleta> {
    const atual = await this.achar(id, ator);
    this.exigirRascunhoDoAutor(atual, ator);

    await this.pacienteVisivel(pedido.pacienteId, ator);

    return this.prisma.$transaction(async (tx) => {
      // Apaga e recria em vez de casar item a item: a fórmula é um bloco, e
      // reconciliar listas aninhadas é a classe de código onde some um item sem
      // ninguém notar.
      await tx.formulacao.deleteMany({ where: { receitaId: id } });

      return tx.receita.update({
        where: { id },
        data: {
          pacienteId: pedido.pacienteId,
          observacoes: pedido.observacoes ?? null,
          formulacoes: { create: this.montarFormulacoes(pedido.formulacoes) },
        },
        include: COM_TUDO,
      });
    });
  }

  async achar(id: string, ator: Ator): Promise<ReceitaCompleta> {
    const receita = await this.prisma.receita.findFirst({
      where: { id, ...escopoDeReceita(ator) },
      include: COM_TUDO,
    });

    if (!receita) throw new NotFoundException('Receita não encontrada.');

    return receita;
  }

  async listar(
    filtro: { pacienteId?: string; estado?: EstadoDaReceita },
    ator: Ator,
  ): Promise<ReceitaCompleta[]> {
    return this.prisma.receita.findMany({
      where: {
        ...escopoDeReceita(ator),
        ...(filtro.pacienteId ? { pacienteId: filtro.pacienteId } : {}),
        ...(filtro.estado ? { estado: filtro.estado } : {}),
      },
      include: COM_TUDO,
      orderBy: { criadaEm: 'desc' },
      take: 50,
    });
  }

  /**
   * Emite: congela e numera.
   *
   * Daqui em diante a receita não muda mais. O que é copiado para dentro dela —
   * peso, CRMV, preço, código e descrição do insumo — é copiado porque o
   * cadastro de origem vai mudar, e o documento não pode mudar junto.
   */
  async emitir(id: string, ator: Prescritor, contexto: Contexto): Promise<ReceitaCompleta> {
    const receita = await this.achar(id, ator);
    this.exigirRascunhoDoAutor(receita, ator);

    if (!ator.crmv) {
      throw new BadRequestException(
        'Receita exige CRMV. Complete o seu cadastro antes de emitir.',
      );
    }

    const peso = receita.paciente.pesoEmGramas;
    if (peso === null) {
      throw new BadRequestException(
        'O paciente está sem peso registrado. A dose foi conferida contra o peso, ' +
          'e sem ele não há o que conferir.',
      );
    }

    const resolvidas = await this.resolverFormulacoes(receita);

    const impedimentos = resolvidas.flatMap((f) => f.impedimentos);
    if (impedimentos.length > 0) {
      throw new BadRequestException(impedimentos.map((i) => i.texto).join(' '));
    }

    const listas = receita.formulacoes.flatMap((f) => f.itens.map((i) => i.insumo.listaDeControle));
    const prazo = prazoDaReceita(listas);
    if (prazo.tipo === 'lista-desconhecida') {
      // Cair no prazo padrão daria seis meses a um controlado. Parar aqui é
      // barulhento de propósito: alguém precisa cadastrar a lista.
      throw new BadRequestException(
        `A lista de controle "${prazo.lista}" não tem prazo de validade cadastrado no sistema. ` +
          'Fale com a administração antes de emitir.',
      );
    }

    const emitidaEm = new Date();

    const emitida = await this.prisma.$transaction(async (tx) => {
      const linhas = await tx.$queryRaw<{ nextval: bigint }[]>(
        Prisma.sql`SELECT nextval('receita_numero_seq')`,
      );

      const proximo = linhas[0]?.nextval;
      if (proximo === undefined) {
        throw new Error('A sequence do número da receita não respondeu.');
      }

      for (const formulacao of resolvidas) {
        await tx.formulacao.update({
          where: { id: formulacao.id },
          data: { formaNome: formulacao.forma, valorEmCentavos: formulacao.valorEmCentavos ?? 0 },
        });

        for (const item of formulacao.itens) {
          await tx.itemDaFormulacao.updateMany({
            where: { formulacaoId: formulacao.id, insumoId: item.insumoId },
            data: {
              insumoCodigo: item.codigo,
              insumoDescricao: item.descricao,
              listaDeControle: item.listaDeControle,
            },
          });
        }
      }

      return tx.receita.update({
        where: { id },
        data: {
          numero: Number(proximo),
          estado: 'EMITIDA',
          emitidaEm,
          validaAte: venceEm(emitidaEm, prazo.dias),
          prazoEmDias: prazo.dias,
          prazoMotivo: prazo.motivo,
          crmvDoVeterinario: ator.crmv,
          pesoDoPacienteEmGramas: peso,
        },
        include: COM_TUDO,
      });
    });

    await this.auditoria.registrar({
      acao: 'RECEITA_EMITIDA',
      usuarioId: ator.id,
      alvo: `receita:${id}`,
      detalhe: {
        numero: emitida.numero,
        prazoEmDias: prazo.dias,
        formulacoes: resolvidas.length,
      },
      ...contexto,
    });

    return emitida;
  }

  /**
   * Cancela. Vale para rascunho e para emitida, e exige motivo.
   *
   * Não existe exclusão: uma receita emitida que some da base é uma receita que
   * a farmácia manipulou sem que reste registro de quem pediu.
   */
  async cancelar(
    id: string,
    motivo: string,
    ator: Ator,
    contexto: Contexto,
  ): Promise<ReceitaCompleta> {
    const receita = await this.achar(id, ator);

    if (receita.estado === 'CANCELADA') {
      throw new BadRequestException('Esta receita já foi cancelada.');
    }

    // O autor cancela a sua; ADMIN cancela qualquer uma. FARMACIA lê, mas não
    // desfaz o que um veterinário assinou.
    const podeCancelar = receita.veterinarioId === ator.id || ator.papel === 'ADMIN';
    if (!podeCancelar) {
      throw new ForbiddenException('Só quem emitiu a receita, ou a administração, pode cancelar.');
    }

    const cancelada = await this.prisma.receita.update({
      where: { id },
      data: { estado: 'CANCELADA', canceladaEm: new Date(), motivoDoCancelamento: motivo },
      include: COM_TUDO,
    });

    await this.auditoria.registrar({
      acao: 'RECEITA_CANCELADA',
      usuarioId: ator.id,
      alvo: `receita:${id}`,
      detalhe: { numero: receita.numero, estadoAnterior: receita.estado, motivo },
      ...contexto,
    });

    return cancelada;
  }

  /**
   * As fórmulas com preço e avisos.
   *
   * Rascunho é cotado agora, contra o catálogo de hoje. Emitida devolve o que
   * ficou congelado — e sem avisos: aviso é ajuda de quem está prescrevendo, e
   * recalculá-lo meses depois contra outro catálogo diria coisas que o
   * veterinário nunca viu na hora de assinar.
   */
  async resolverFormulacoes(receita: ReceitaCompleta): Promise<FormulacaoResolvida[]> {
    const congelada = receita.estado !== 'RASCUNHO';

    const resolvidas: FormulacaoResolvida[] = [];

    for (const formulacao of receita.formulacoes) {
      const itens = formulacao.itens.map((item) => ({
        insumoId: item.insumoId,
        codigo: congelada ? (item.insumoCodigo ?? item.insumo.codigo) : item.insumo.codigo,
        descricao: congelada
          ? (item.insumoDescricao ?? item.insumo.descricao)
          : item.insumo.descricao,
        doseMg: item.dosePorUnidadeEmMicrogramas / 1000,
        listaDeControle: congelada
          ? (item.listaDeControle ?? item.insumo.listaDeControle)
          : item.insumo.listaDeControle,
      }));

      if (congelada) {
        resolvidas.push({
          id: formulacao.id,
          formaId: formulacao.formaId,
          forma: formulacao.formaNome ?? formulacao.forma.nome,
          frequenciaHoras: formulacao.frequenciaHoras,
          dias: formulacao.dias,
          quantidade: formulacao.quantidade,
          orientacao: formulacao.orientacao,
          valorEmCentavos: formulacao.valorEmCentavos,
          itens,
          avisos: [],
          impedimentos: [],
        });
        continue;
      }

      const peso = receita.paciente.pesoEmGramas;
      const orcamento = await this.catalogo.orcar(
        // Todos os itens da mesma fórmula são manipulados nas mesmas unidades —
        // é a mesma cápsula. O motor aceitaria quantidades diferentes por item;
        // a receita não, porque isso seria outra fórmula.
        formulacao.itens.map((i) => ({
          insumoId: i.insumoId,
          doseMg: i.dosePorUnidadeEmMicrogramas / 1000,
          quantidade: formulacao.quantidade,
        })),
        formulacao.formaId,
        peso === null ? undefined : { especie: receita.paciente.especie, pesoEmGramas: peso },
      );

      const avisos: AvisoDaReceita[] = [...orcamento.avisos];

      if (peso !== null) {
        // Uma consulta para a fórmula inteira, e não uma por item: são até
        // vinte itens, e vinte idas ao banco por fórmula custariam caro numa
        // tela que recota a cada tecla.
        const faixas = await this.prisma.faixaTerapeutica.findMany({
          where: { insumoId: { in: formulacao.itens.map((i) => i.insumoId) } },
        });

        for (const item of formulacao.itens) {
          const conferencia = conferirDuracao(
            faixas.filter((f) => f.insumoId === item.insumoId),
            { especie: receita.paciente.especie, pesoEmGramas: peso },
            formulacao.dias,
          );

          const frase = descreverDuracao(conferencia, item.insumo.descricao, formulacao.dias);
          if (frase) {
            avisos.push({ tipo: 'duracao-acima', insumoId: item.insumoId, texto: frase });
          }
        }
      }

      resolvidas.push({
        id: formulacao.id,
        formaId: formulacao.formaId,
        forma: orcamento.forma,
        frequenciaHoras: formulacao.frequenciaHoras,
        dias: formulacao.dias,
        quantidade: formulacao.quantidade,
        orientacao: formulacao.orientacao,
        valorEmCentavos:
          orcamento.impedimentos.length > 0 ? null : orcamento.calculo.valorFinalEmCentavos,
        itens,
        avisos,
        impedimentos: orcamento.impedimentos,
      });
    }

    return resolvidas;
  }

  /** Situação com o relógio já contado. */
  situacao(receita: { estado: EstadoDaReceita; validaAte: Date | null }) {
    return situacaoDaReceita(receita);
  }

  // --- apoio ---

  private montarFormulacoes(
    pedidas: FormulacaoPedida[],
  ): Prisma.FormulacaoCreateWithoutReceitaInput[] {
    return pedidas.map((formulacao, ordem) => {
      const insumos = new Set(formulacao.itens.map((i) => i.insumoId));
      if (insumos.size !== formulacao.itens.length) {
        throw new BadRequestException('O mesmo insumo aparece duas vezes na mesma fórmula.');
      }


      return {
        forma: { connect: { id: formulacao.formaId } },
        frequenciaHoras: formulacao.frequenciaHoras,
        dias: formulacao.dias,
        // Sem quantidade informada, sai da posologia: dias × doses por dia.
        quantidade:
          formulacao.quantidade ?? quantidadeDeDoses(formulacao.frequenciaHoras, formulacao.dias),
        orientacao: formulacao.orientacao ?? null,
        ordem,
        itens: {
          create: formulacao.itens.map((item, posicao) => ({
            insumo: { connect: { id: item.insumoId } },
            dosePorUnidadeEmMicrogramas: Math.round(item.doseMg * 1000),
            ordem: posicao,
          })),
        },
      };
    });
  }

  private async pacienteVisivel(id: string, ator: Ator) {
    const paciente = await this.prisma.paciente.findFirst({
      where: {
        id,
        ...(ator.papel === 'ADMIN' || ator.papel === 'FARMACIA'
          ? {}
          : { tutor: { cadastradoPorId: ator.id } }),
      },
    });

    if (!paciente) throw new NotFoundException('Paciente não encontrado.');
    if (paciente.obitoEm !== null) {
      throw new BadRequestException('Este paciente está registrado como falecido.');
    }

    return paciente;
  }

  private exigirRascunhoDoAutor(receita: ReceitaCompleta, ator: Ator): void {
    if (receita.veterinarioId !== ator.id) {
      throw new ForbiddenException('Só quem criou a receita pode alterá-la.');
    }

    if (receita.estado !== 'RASCUNHO') {
      throw new BadRequestException(
        'Receita emitida não se altera. Cancele e emita uma nova no lugar.',
      );
    }
  }
}

export type Contexto = { ip?: string | null; agenteDeUsuario?: string | null };
