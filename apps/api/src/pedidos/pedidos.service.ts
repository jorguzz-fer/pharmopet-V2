import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ESTADOS_DO_PEDIDO,
  formatarCnpj,
  pedidoEmAberto,
  podeSerAtendida,
  rotuloDoEstado,
  transicaoPermitida,
  type DestinoDaEntrega,
  type EstadoDoPedido,
} from '@pharmopet/shared';
import { AuditoriaService } from '../identidade/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceitaService, type Contexto } from '../receituario/receita.service';
import { escopoDeReceita, veTudo, type Ator } from '../receituario/escopo';
import { ClinicasService } from '../clinicas/clinicas.service';

const COM_TUDO = {
  enviadoPor: { select: { nome: true } },
  receita: {
    include: {
      paciente: { include: { tutor: true } },
      veterinario: { select: { id: true, nome: true, crmv: true } },
      clinica: true,
      formulacoes: {
        orderBy: { ordem: 'asc' },
        include: {
          forma: { select: { id: true, nome: true } },
          itens: {
            orderBy: { ordem: 'asc' },
            include: {
              insumo: {
                select: { id: true, codigo: true, descricao: true, listaDeControle: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PedidoInclude;

export type PedidoCompleto = Prisma.PedidoGetPayload<{ include: typeof COM_TUDO }>;

/**
 * Pedidos: o que a farmácia vai manipular.
 *
 * A receita não muda aqui. Nenhum método deste serviço escreve em `Receita` —
 * quem anda é o pedido, e é isso que mantém o documento imutável enquanto o
 * atendimento acontece.
 */
@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receitas: ReceitaService,
    private readonly auditoria: AuditoriaService,
    private readonly clinicas: ClinicasService,
  ) {}

  /** Manda a receita para a farmácia. Só quem já enxergava a receita. */
  async enviar(
    pedido: { receitaId: string; destino: DestinoDaEntrega; observacoes?: string },
    ator: Ator,
    contexto: Contexto,
  ): Promise<PedidoCompleto> {
    const receita = await this.receitas.achar(pedido.receitaId, ator);

    if (!podeSerAtendida(receita)) {
      // A mesma regra que a tela usa para esconder o botão. Aqui ela é o que
      // impede a farmácia de manipular por um papel que não vale.
      throw new BadRequestException(
        'Só receita válida pode virar pedido. Esta está em rascunho, vencida ou cancelada.',
      );
    }

    // `achar` já garantiu o escopo, mas o `select` dele não traz endereço —
    // e endereço é o que este método precisa gravar. Uma consulta a mais, com
    // o id já autorizado.
    const paraEndereco = await this.prisma.receita.findUniqueOrThrow({
      where: { id: receita.id },
      select: {
        clinica: true,
        paciente: { select: { tutor: true } },
      },
    });

    const enderecoDeEntrega = this.enderecoDe(pedido.destino, paraEndereco);

    let criado: PedidoCompleto;
    try {
      criado = await this.prisma.pedido.create({
        data: {
          receitaId: receita.id,
          enviadoPorId: ator.id,
          destino: pedido.destino,
          enderecoDeEntrega,
          observacoes: pedido.observacoes ?? null,
        },
        include: COM_TUDO,
      });
    } catch (erro) {
      // O índice parcial `pedido_um_vivo_por_receita` é quem realmente segura
      // o duplo clique: uma conferência antes do insert perderia a corrida.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ConflictException('Esta receita já tem um pedido em andamento.');
      }
      throw erro;
    }

    await this.auditoria.registrar({
      acao: 'PEDIDO_ENVIADO',
      usuarioId: ator.id,
      alvo: `pedido:${criado.id}`,
      detalhe: { numero: criado.numero, receita: receita.numero, destino: pedido.destino },
      ...contexto,
    });

    return criado;
  }

  async listar(
    filtro: { estado?: EstadoDoPedido; emAberto?: boolean; receitaId?: string },
    ator: Ator,
  ): Promise<PedidoCompleto[]> {
    const abertos = ESTADOS_DO_PEDIDO.filter(pedidoEmAberto);

    return this.prisma.pedido.findMany({
      where: {
        ...(filtro.estado ? { estado: filtro.estado } : {}),
        ...(filtro.emAberto ? { estado: { in: abertos } } : {}),
        ...(filtro.receitaId ? { receitaId: filtro.receitaId } : {}),
        ...(await this.escopo(ator)),
      },
      include: COM_TUDO,
      // Por chegada: é a ordem em que a bancada trabalha, e inverter isso
      // deixaria o pedido mais antigo sempre no fim da tela.
      orderBy: { criadoEm: 'asc' },
      take: 200,
    });
  }

  async achar(id: string, ator: Ator): Promise<PedidoCompleto> {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id, ...(await this.escopo(ator)) },
      include: COM_TUDO,
    });

    // 404 e não 403, como no resto: "existe mas não é seu" já confirma o
    // registro para quem está sondando.
    if (!pedido) throw new NotFoundException('Pedido não encontrado.');

    return pedido;
  }

  /**
   * Move o pedido.
   *
   * Quem produz decide o caminho; quem prescreve só pode desistir enquanto
   * ninguém começou — que é o que corresponde ao que ainda é reversível.
   */
  async mudarEstado(
    id: string,
    para: EstadoDoPedido,
    motivo: string | undefined,
    ator: Ator,
    contexto: Contexto,
  ): Promise<PedidoCompleto> {
    const pedido = await this.achar(id, ator);

    this.exigirPermissaoPara(pedido, para, ator);

    if (!transicaoPermitida(pedido.estado, para)) {
      throw new BadRequestException(
        `Um pedido ${rotuloDoEstado(pedido.estado).toLowerCase()} não pode ir para ` +
          `${rotuloDoEstado(para).toLowerCase()}.`,
      );
    }

    if (para === 'CANCELADO' && !motivo) {
      throw new BadRequestException('Diga por que o pedido está sendo cancelado.');
    }

    const agora = new Date();
    const atualizado = await this.prisma.pedido.update({
      where: { id },
      data: {
        estado: para,
        motivoDoCancelamento: para === 'CANCELADO' ? (motivo ?? null) : pedido.motivoDoCancelamento,
        // Cada marco grava a própria hora. Um campo só, sobrescrito, perderia
        // quanto tempo o pedido passou em cada etapa — que é a pergunta que a
        // farmácia vai querer responder depois.
        ...(para === 'EM_PRODUCAO' ? { producaoEm: agora } : {}),
        ...(para === 'PRONTO' ? { prontoEm: agora } : {}),
        ...(para === 'ENTREGUE' ? { entregueEm: agora } : {}),
      },
      include: COM_TUDO,
    });

    await this.auditoria.registrar({
      acao: 'PEDIDO_MUDOU_DE_ESTADO',
      usuarioId: ator.id,
      alvo: `pedido:${id}`,
      detalhe: { numero: pedido.numero, de: pedido.estado, para, ...(motivo ? { motivo } : {}) },
      ...contexto,
    });

    return atualizado;
  }

  /** O pedido vivo de uma receita, para a tela dela saber o que mostrar. */
  async daReceita(receitaId: string, ator: Ator): Promise<PedidoCompleto | null> {
    return this.prisma.pedido.findFirst({
      where: { receitaId, estado: { not: 'CANCELADO' }, ...(await this.escopo(ator)) },
      include: COM_TUDO,
    });
  }

  /**
   * Quem pode mover para onde.
   *
   * FARMACIA e ADMIN conduzem o pedido. Quem prescreve só cancela, e só
   * enquanto está em análise: depois disso já há insumo pesado do outro lado,
   * e desistir passa a ser conversa, não botão.
   */
  private exigirPermissaoPara(pedido: PedidoCompleto, para: EstadoDoPedido, ator: Ator): void {
    if (veTudo(ator)) return;

    if (para !== 'CANCELADO' || pedido.estado !== 'EM_ANALISE') {
      throw new BadRequestException(
        'Só a farmácia muda o andamento do pedido. Fale com ela para cancelar este.',
      );
    }
  }

  /** O pedido herda a visibilidade da receita que o originou (ADR 0014). */
  private async escopo(ator: Ator): Promise<Prisma.PedidoWhereInput> {
    if (veTudo(ator)) return {};

    const minhasClinicas = await this.clinicas.idsVisiveis(ator.id);

    return { receita: escopoDeReceita(ator, minhasClinicas) };
  }

  /**
   * Para onde a encomenda vai, por extenso e congelado.
   *
   * Recusa em vez de gravar endereço vazio: um pedido sem destino legível é um
   * pedido que a farmácia não consegue despachar, e descobrir isso na hora de
   * postar custa um dia.
   */
  private enderecoDe(
    destino: DestinoDaEntrega,
    receita: {
      clinica: (ComEndereco & { nomeFantasia: string; cnpj: string }) | null;
      paciente: { tutor: ComEndereco & { nome: string } };
    },
  ): string {
    if (destino === 'CLINICA') {
      const clinica = receita.clinica;
      if (!clinica) {
        throw new BadRequestException(
          'Esta receita não saiu por uma clínica, então não há para onde entregar lá.',
        );
      }

      const endereco = montarEndereco(clinica);
      if (!endereco) {
        throw new BadRequestException(
          `A clínica ${clinica.nomeFantasia} está sem endereço cadastrado. ` +
            'Complete o cadastro dela antes de enviar.',
        );
      }

      return `${clinica.nomeFantasia} (CNPJ ${formatarCnpj(clinica.cnpj)}) — ${endereco}`;
    }

    const tutor = receita.paciente.tutor;
    const endereco = montarEndereco(tutor);
    if (!endereco) {
      throw new BadRequestException(
        `${tutor.nome} está sem endereço cadastrado. Complete a ficha antes de enviar para o tutor.`,
      );
    }

    return `${tutor.nome} — ${endereco}`;
  }
}

type ComEndereco = {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento?: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

/** `null` quando não há nem rua nem cidade — aí não é endereço, é um CEP solto. */
function montarEndereco(dono: ComEndereco): string | null {
  const rua = [dono.logradouro, dono.numero].filter(Boolean).join(', ');
  const local = [dono.bairro, dono.cidade, dono.uf].filter(Boolean).join(' · ');

  if (!rua && !local) return null;

  return [rua, dono.complemento, local, dono.cep].filter(Boolean).join(' — ');
}
