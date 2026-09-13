import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { rotuloDoAroma, type Aroma } from '@pharmopet/shared';
import { Eu, Papeis } from '../identidade/decoradores';
import type { RequisicaoComUsuario } from '../identidade/requisicao';
import type { UsuarioAutenticado } from '../identidade/sessao.service';
import {
  EnviarPedidoDto,
  ListaDePedidosDto,
  MudarEstadoDto,
  PedidoDto,
  filtroDePedidosSchema,
} from './pedidos.dto';
import { PedidosService, type PedidoCompleto } from './pedidos.service';

@ApiTags('pedidos')
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  /**
   * Quem prescreve manda; o tutor não.
   *
   * Um botão "quero este medicamento" na página pública seria e-commerce — que
   * o plano deixou fora de escopo — e faria a farmácia receber pedido de
   * controlado de alguém que o sistema não identifica (ADR 0014).
   */
  @Papeis('VETERINARIO', 'CLINICA', 'ADMIN')
  @Post()
  @ApiOperation({ summary: 'Manda uma receita emitida para a farmácia' })
  @ApiCreatedResponse({ type: PedidoDto })
  @ApiBadRequestResponse({ description: 'Receita não válida, ou destino sem endereço.' })
  @ApiConflictResponse({ description: 'Esta receita já tem um pedido em andamento.' })
  async enviar(
    @Body() corpo: EnviarPedidoDto,
    @Eu() eu: UsuarioAutenticado,
    @Req() requisicao: RequisicaoComUsuario,
  ): Promise<PedidoDto> {
    return montar(await this.pedidos.enviar(corpo, eu, contextoDe(requisicao)));
  }

  @Get()
  @ApiOperation({ summary: 'A fila da farmácia' })
  @ApiQuery({ name: 'estado', required: false })
  @ApiQuery({ name: 'emAberto', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'receitaId', required: false })
  @ApiOkResponse({ type: ListaDePedidosDto })
  async listar(
    @Eu() eu: UsuarioAutenticado,
    @Query('estado') estado?: string,
    @Query('emAberto') emAberto?: string,
    @Query('receitaId') receitaId?: string,
  ): Promise<ListaDePedidosDto> {
    const filtro = filtroDePedidosSchema.parse({ estado, emAberto, receitaId });

    return { pedidos: (await this.pedidos.listar(filtro, eu)).map(montar) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Um pedido' })
  @ApiOkResponse({ type: PedidoDto })
  @ApiNotFoundResponse({ description: 'Não existe, ou não é visível para quem perguntou.' })
  async achar(@Param('id') id: string, @Eu() eu: UsuarioAutenticado): Promise<PedidoDto> {
    return montar(await this.pedidos.achar(id, eu));
  }

  @Post(':id/estado')
  @HttpCode(200)
  @ApiOperation({ summary: 'Move o pedido para o próximo estado' })
  @ApiOkResponse({ type: PedidoDto })
  @ApiBadRequestResponse({ description: 'Transição não permitida, ou falta o motivo.' })
  async mudarEstado(
    @Param('id') id: string,
    @Body() corpo: MudarEstadoDto,
    @Eu() eu: UsuarioAutenticado,
    @Req() requisicao: RequisicaoComUsuario,
  ): Promise<PedidoDto> {
    return montar(
      await this.pedidos.mudarEstado(id, corpo.estado, corpo.motivo, eu, contextoDe(requisicao)),
    );
  }
}

/**
 * O pedido como a fila o lê.
 *
 * Traz a fórmula resumida e o total, e não a composição do preço: o custo do
 * insumo e a margem continuam restritos como na fase 3, mesmo aqui, onde quem
 * olha é a própria farmácia — a tela é a mesma que um dia terá outro público.
 */
function montar(pedido: PedidoCompleto): PedidoDto {
  const receita = pedido.receita;
  const congelada = receita.estado !== 'RASCUNHO';

  return {
    id: pedido.id,
    numero: pedido.numero,
    estado: pedido.estado,
    destino: pedido.destino,
    enderecoDeEntrega: pedido.enderecoDeEntrega,
    observacoes: pedido.observacoes,
    motivoDoCancelamento: pedido.motivoDoCancelamento,

    receitaId: receita.id,
    receitaNumero: receita.numero,
    pacienteNome: receita.paciente.nome,
    tutorNome: receita.paciente.tutor.nome,
    clinicaNome: receita.clinicaNome ?? receita.clinica?.nomeFantasia ?? null,
    veterinarioNome: receita.veterinario.nome,
    enviadoPorNome: pedido.enviadoPor.nome,

    formulacoes: receita.formulacoes.map((f) => ({
      forma: f.formaNome ?? f.forma.nome,
      quantidade: f.quantidade,
      aroma: f.aroma === null ? null : rotuloDoAroma(f.aroma as Aroma),
      usoContinuo: f.usoContinuo,
      itens: f.itens.map((i) => ({
        descricao: congelada ? (i.insumoDescricao ?? i.insumo.descricao) : i.insumo.descricao,
        doseMg: i.dosePorUnidadeEmMicrogramas / 1000,
      })),
    })),
    // Congelado na emissão. Recalcular aqui diria um número que o veterinário
    // nunca viu e que o tutor já leu diferente no link.
    valorTotalEmCentavos: receita.formulacoes.reduce((t, f) => t + (f.valorEmCentavos ?? 0), 0),

    criadoEm: pedido.criadoEm.toISOString(),
    producaoEm: pedido.producaoEm?.toISOString() ?? null,
    prontoEm: pedido.prontoEm?.toISOString() ?? null,
    entregueEm: pedido.entregueEm?.toISOString() ?? null,
  };
}

function contextoDe(requisicao: RequisicaoComUsuario): {
  ip?: string | null;
  agenteDeUsuario?: string | null;
} {
  return { ip: requisicao.ip ?? null, agenteDeUsuario: requisicao.get?.('user-agent') ?? null };
}
