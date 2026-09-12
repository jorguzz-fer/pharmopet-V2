import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { EstadoDaReceita } from '@prisma/client';
import { situacaoDaReceita } from '@pharmopet/shared';
import { Eu, Papeis } from '../identidade/decoradores';
import type { RequisicaoComUsuario } from '../identidade/requisicao';
import type { UsuarioAutenticado } from '../identidade/sessao.service';
import {
  CancelarReceitaDto,
  ListaDeReceitasDto,
  ReceitaDto,
  SalvarReceitaDto,
} from './receituario.dto';
import { ReceitaService, type FormulacaoResolvida } from './receita.service';

type ReceitaDoBanco = Awaited<ReturnType<ReceitaService['achar']>>;

@ApiTags('receituário')
@Controller('receituario/receitas')
export class ReceitaController {
  constructor(private readonly receitas: ReceitaService) {}

  @Papeis('VETERINARIO')
  @Post()
  @ApiOperation({ summary: 'Abre um rascunho de receita' })
  @ApiCreatedResponse({ type: ReceitaDto })
  async criar(@Body() corpo: SalvarReceitaDto, @Eu() eu: UsuarioAutenticado): Promise<ReceitaDto> {
    return this.montar(await this.receitas.criar(corpo, eu));
  }

  @Get()
  @ApiOperation({ summary: 'Lista receitas' })
  @ApiQuery({ name: 'pacienteId', required: false })
  @ApiQuery({ name: 'estado', required: false, enum: ['RASCUNHO', 'EMITIDA', 'CANCELADA'] })
  @ApiOkResponse({ type: ListaDeReceitasDto })
  async listar(
    @Eu() eu: UsuarioAutenticado,
    @Query('pacienteId') pacienteId?: string,
    @Query('estado') estado?: EstadoDaReceita,
  ): Promise<ListaDeReceitasDto> {
    const receitas = await this.receitas.listar({ pacienteId, estado }, eu);

    return {
      receitas: receitas.map((r) => ({
        id: r.id,
        numero: r.numero,
        estado: r.estado,
        situacao: situacaoDaReceita(r),
        pacienteNome: r.paciente.nome,
        tutorNome: r.paciente.tutor.nome,
        veterinarioNome: r.veterinario.nome,
        emitidaEm: r.emitidaEm?.toISOString() ?? null,
        validaAte: r.validaAte?.toISOString() ?? null,
        criadaEm: r.criadaEm.toISOString(),
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'A receita inteira, com fórmulas, preço e avisos' })
  @ApiOkResponse({ type: ReceitaDto })
  @ApiNotFoundResponse({ description: 'Não existe, ou não é visível para quem perguntou.' })
  async achar(@Param('id') id: string, @Eu() eu: UsuarioAutenticado): Promise<ReceitaDto> {
    return this.montar(await this.receitas.achar(id, eu));
  }

  /**
   * Substitui o rascunho inteiro.
   *
   * PUT, e não PATCH: o corpo da receita é um bloco — paciente, fórmulas,
   * itens. Alteração parcial de lista aninhada é a forma mais fácil de perder
   * um item sem que a resposta acuse.
   */
  @Papeis('VETERINARIO')
  @Put(':id')
  @ApiOperation({ summary: 'Regrava o rascunho' })
  @ApiOkResponse({ type: ReceitaDto })
  @ApiBadRequestResponse({ description: 'Receita emitida não se altera.' })
  async salvar(
    @Param('id') id: string,
    @Body() corpo: SalvarReceitaDto,
    @Eu() eu: UsuarioAutenticado,
  ): Promise<ReceitaDto> {
    return this.montar(await this.receitas.salvar(id, corpo, eu));
  }

  @Papeis('VETERINARIO')
  @Post(':id/emitir')
  @HttpCode(200)
  @ApiOperation({ summary: 'Emite a receita: numera, congela e passa a valer' })
  @ApiOkResponse({ type: ReceitaDto })
  @ApiBadRequestResponse({
    description:
      'Falta CRMV, falta peso do paciente, há impedimento na fórmula ou lista sem prazo.',
  })
  async emitir(
    @Param('id') id: string,
    @Eu() eu: UsuarioAutenticado,
    @Req() requisicao: RequisicaoComUsuario,
  ): Promise<ReceitaDto> {
    return this.montar(await this.receitas.emitir(id, eu, contextoDe(requisicao)));
  }

  @Papeis('VETERINARIO', 'ADMIN')
  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancela a receita, com motivo' })
  @ApiOkResponse({ type: ReceitaDto })
  async cancelar(
    @Param('id') id: string,
    @Body() corpo: CancelarReceitaDto,
    @Eu() eu: UsuarioAutenticado,
    @Req() requisicao: RequisicaoComUsuario,
  ): Promise<ReceitaDto> {
    return this.montar(await this.receitas.cancelar(id, corpo.motivo, eu, contextoDe(requisicao)));
  }

  private async montar(receita: ReceitaDoBanco): Promise<ReceitaDto> {
    const formulacoes = await this.receitas.resolverFormulacoes(receita);

    return {
      id: receita.id,
      numero: receita.numero,
      estado: receita.estado,
      situacao: situacaoDaReceita(receita),
      veterinarioId: receita.veterinarioId,
      veterinarioNome: receita.veterinario.nome,
      // O CRMV congelado quando existe; o atual enquanto é rascunho.
      crmv: receita.crmvDoVeterinario ?? receita.veterinario.crmv,
      pacienteId: receita.pacienteId,
      pacienteNome: receita.paciente.nome,
      tutorNome: receita.paciente.tutor.nome,
      pesoDoPacienteEmGramas: receita.pesoDoPacienteEmGramas ?? receita.paciente.pesoEmGramas,
      emitidaEm: receita.emitidaEm?.toISOString() ?? null,
      validaAte: receita.validaAte?.toISOString() ?? null,
      prazoEmDias: receita.prazoEmDias,
      prazoMotivo: receita.prazoMotivo,
      canceladaEm: receita.canceladaEm?.toISOString() ?? null,
      motivoDoCancelamento: receita.motivoDoCancelamento,
      observacoes: receita.observacoes,
      formulacoes,
      valorTotalEmCentavos: somar(formulacoes),
      criadaEm: receita.criadaEm.toISOString(),
    };
  }
}

/**
 * Soma o que tem preço.
 *
 * Fórmula impedida entra como `null`, e somar `null` como zero faria a receita
 * parecer mais barata do que é. Fica de fora, e o impedimento aparece na
 * própria fórmula.
 */
function somar(formulacoes: FormulacaoResolvida[]): number {
  return formulacoes.reduce((total, f) => total + (f.valorEmCentavos ?? 0), 0);
}

function contextoDe(requisicao: RequisicaoComUsuario): {
  ip?: string | null;
  agenteDeUsuario?: string | null;
} {
  return { ip: requisicao.ip ?? null, agenteDeUsuario: requisicao.get?.('user-agent') ?? null };
}
