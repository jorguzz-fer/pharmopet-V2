import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Eu, Papeis } from '../identidade/decoradores';
import type { UsuarioAutenticado } from '../identidade/sessao.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CondicoesDto,
  CriarFaixaDto,
  CriarFormaDto,
  CriarInsumoDto,
  CriarRestricaoDto,
  FaixaDto,
  FormaDto,
  InsumoAdminDto,
  ListaDeFormasDto,
  ListaDeInsumosDto,
  OrcamentoDetalhadoDto,
  OrcamentoDto,
  PrecificarDto,
} from './catalogo.dto';
import { CatalogoService, type OrcamentoCompleto } from './catalogo.service';

@ApiTags('catálogo')
@Controller('catalogo')
export class CatalogoController {
  constructor(
    private readonly catalogo: CatalogoService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('insumos')
  @ApiOperation({ summary: 'Busca insumos pelo nome ou pelo código' })
  @ApiQuery({ name: 'busca', required: false })
  @ApiOkResponse({ type: ListaDeInsumosDto })
  async insumos(@Query('busca') busca?: string): Promise<ListaDeInsumosDto> {
    const registros = await this.catalogo.listarInsumos(busca);

    return {
      insumos: registros.map((i) => ({
        id: i.id,
        codigo: i.codigo,
        descricao: i.descricao,
        controlado: i.controlado,
        listaDeControle: i.listaDeControle,
        estoque: situacaoDoEstoque(i.estoqueEmMiligramas),
        formasProibidas: i.restricoes.map((r) => ({
          formaId: r.forma.id,
          nome: r.forma.nome,
          motivo: r.motivo,
        })),
      })),
    };
  }

  @Get('formas')
  @ApiOperation({ summary: 'Formas farmacêuticas disponíveis' })
  @ApiOkResponse({ type: ListaDeFormasDto })
  async formas(): Promise<ListaDeFormasDto> {
    return { formas: await this.catalogo.listarFormas() };
  }

  /**
   * Orçamento para quem prescreve.
   *
   * Devolve o valor final e mais nada sobre como ele foi formado. Não é a tela
   * que esconde: o custo não sai daqui, porque o que chega ao navegador é
   * visível para quem abrir o inspetor.
   */
  @Post('orcamento')
  @HttpCode(200)
  @ApiOperation({ summary: 'Calcula o preço de uma formulação' })
  @ApiOkResponse({ type: OrcamentoDto })
  async orcamento(@Body() corpo: PrecificarDto): Promise<OrcamentoDto> {
    const completo = await this.catalogo.orcar(
      corpo.itens,
      corpo.formaId,
      corpo.paciente,
      corpo.clinicaId,
    );

    return resumir(completo);
  }

  /**
   * O mesmo orçamento, aberto. Para quem opera a farmácia e precisa conferir de
   * onde veio o número.
   */
  @Papeis('ADMIN', 'FARMACIA')
  @Post('orcamento/detalhado')
  @HttpCode(200)
  @ApiOperation({ summary: 'Calcula o preço e mostra a composição' })
  @ApiOkResponse({ type: OrcamentoDetalhadoDto })
  @ApiForbiddenResponse({ description: 'A composição do preço não é visível para o prescritor.' })
  async orcamentoDetalhado(@Body() corpo: PrecificarDto): Promise<OrcamentoDetalhadoDto> {
    const completo = await this.catalogo.orcar(
      corpo.itens,
      corpo.formaId,
      corpo.paciente,
      corpo.clinicaId,
    );
    const { calculo } = completo;

    return {
      ...resumir(completo),
      itens: calculo.itens.map((i) => ({
        // Pelo código, que é único no catálogo. Casar por descrição juntaria
        // dois insumos homônimos — e homônimo existe: "Vitamina B12" pode ter
        // cadastro separado por fornecedor.
        insumoId: completo.idPorCodigo.get(i.codigo) ?? '',
        descricao: i.descricao,
        massaTotalEmMiligramas: i.massaTotalEmMiligramas,
        custoEmCentavos: i.custoEmCentavos,
      })),
      totalDeMateriaPrimaEmCentavos: calculo.totalDeMateriaPrimaEmCentavos,
      taxaDeManipulacaoEmCentavos: calculo.taxaDeManipulacaoEmCentavos,
      custoDeEmbalagensEmCentavos: calculo.custoDeEmbalagensEmCentavos,
      subtotalEmCentavos: calculo.subtotalEmCentavos,
      descontoEmCentavos: calculo.descontoEmCentavos,
      adicionalDeEntregaEmCentavos: calculo.adicionalDeEntregaEmCentavos,
      adicionalDeBiscoitoEmCentavos: calculo.adicionalDeBiscoitoEmCentavos,
    };
  }

  // --- Administração do catálogo ---

  @Papeis('ADMIN')
  @Post('insumos')
  @ApiOperation({ summary: 'Cadastra um insumo' })
  @ApiCreatedResponse({ type: InsumoAdminDto })
  async criarInsumo(
    @Eu() _autor: UsuarioAutenticado,
    @Body() corpo: CriarInsumoDto,
  ): Promise<InsumoAdminDto> {
    const criado = await this.prisma.insumo.create({
      data: {
        codigo: corpo.codigo.trim(),
        descricao: corpo.descricao.trim(),
        custoPorGramaEmMicro: corpo.custoPorGramaEmMicro,
        custoDeReferenciaPorGramaEmMicro: corpo.custoDeReferenciaPorGramaEmMicro,
        markupEmCentesimos: corpo.markupEmCentesimos,
        estoqueEmMiligramas: corpo.estoqueEmMiligramas ?? null,
        controlado: corpo.controlado,
        listaDeControle: corpo.listaDeControle?.trim() || null,
      },
    });

    return {
      id: criado.id,
      codigo: criado.codigo,
      descricao: criado.descricao,
      controlado: criado.controlado,
      listaDeControle: criado.listaDeControle,
      estoque: situacaoDoEstoque(criado.estoqueEmMiligramas),
      formasProibidas: [],
      custoPorGramaEmMicro: criado.custoPorGramaEmMicro,
      custoDeReferenciaPorGramaEmMicro: criado.custoDeReferenciaPorGramaEmMicro,
      markupEmCentesimos: criado.markupEmCentesimos,
      estoqueEmMiligramas: criado.estoqueEmMiligramas,
    };
  }

  @Papeis('ADMIN')
  @Post('formas')
  @ApiOperation({ summary: 'Cadastra uma forma farmacêutica' })
  @ApiCreatedResponse({ type: FormaDto })
  async criarForma(@Body() corpo: CriarFormaDto): Promise<FormaDto> {
    const criada = await this.prisma.formaFarmaceutica.create({
      data: { nome: corpo.nome.trim().toUpperCase(), aceitaAroma: corpo.aceitaAroma ?? false },
    });

    return { id: criada.id, nome: criada.nome, aceitaAroma: criada.aceitaAroma };
  }

  @Papeis('ADMIN')
  @Post('restricoes')
  @HttpCode(204)
  @ApiOperation({ summary: 'Proíbe um insumo numa forma' })
  async criarRestricao(@Body() corpo: CriarRestricaoDto): Promise<void> {
    await this.prisma.restricaoDeForma.upsert({
      where: { insumoId_formaId: { insumoId: corpo.insumoId, formaId: corpo.formaId } },
      update: { motivo: corpo.motivo.trim() },
      create: { insumoId: corpo.insumoId, formaId: corpo.formaId, motivo: corpo.motivo.trim() },
    });
  }

  @Papeis('ADMIN')
  @Post('faixas')
  @ApiOperation({ summary: 'Cadastra uma faixa terapêutica' })
  @ApiCreatedResponse({ type: FaixaDto })
  async criarFaixa(@Body() corpo: CriarFaixaDto): Promise<FaixaDto> {
    const criada = await this.prisma.faixaTerapeutica.create({
      data: {
        insumoId: corpo.insumoId,
        especie: corpo.especie,
        pesoMinimoEmGramas: corpo.pesoMinimoEmGramas ?? null,
        pesoMaximoEmGramas: corpo.pesoMaximoEmGramas ?? null,
        doseMinimaEmMicrogramasPorKg: corpo.doseMinimaEmMicrogramasPorKg,
        doseMaximaEmMicrogramasPorKg: corpo.doseMaximaEmMicrogramasPorKg,
        duracaoMaximaEmDias: corpo.duracaoMaximaEmDias ?? null,
        observacao: corpo.observacao ?? null,
      },
    });

    return criada;
  }

  @Papeis('ADMIN', 'FARMACIA')
  @Get('condicoes')
  @ApiOperation({ summary: 'Condições comerciais em vigor' })
  @ApiOkResponse({ type: CondicoesDto })
  async lerCondicoes(): Promise<CondicoesDto> {
    return this.catalogo.condicoes();
  }

  @Papeis('ADMIN')
  @Put('condicoes')
  @ApiOperation({ summary: 'Altera as condições comerciais' })
  @ApiOkResponse({ type: CondicoesDto })
  async gravarCondicoes(@Body() corpo: CondicoesDto): Promise<CondicoesDto> {
    return this.catalogo.definirCondicoes(corpo);
  }

  @Papeis('ADMIN')
  @Get('insumos/:id/faixas')
  @ApiOperation({ summary: 'Faixas terapêuticas de um insumo' })
  @ApiOkResponse({ type: [FaixaDto] })
  async faixasDoInsumo(@Param('id') id: string): Promise<FaixaDto[]> {
    return this.prisma.faixaTerapeutica.findMany({
      where: { insumoId: id },
      orderBy: [{ especie: 'asc' }, { pesoMinimoEmGramas: 'asc' }],
    });
  }
}

/**
 * Situação do estoque, e não a quantidade.
 *
 * Três estados, não dois: o export da farmácia não diz em que unidade o estoque
 * está, então muito insumo entra sem essa informação. Chamar isso de "em falta"
 * encheria a tela de aviso falso.
 */
function situacaoDoEstoque(
  emMiligramas: number | null,
): 'disponivel' | 'em-falta' | 'desconhecido' {
  if (emMiligramas === null) return 'desconhecido';
  return emMiligramas > 0 ? 'disponivel' : 'em-falta';
}

/** A parte do orçamento que todo papel pode ver. */
function resumir(completo: OrcamentoCompleto): OrcamentoDto {
  return {
    // Fórmula impedida não tem preço: devolver um valor junto do impedimento
    // convidaria a tela a mostrá-lo.
    valorFinalEmCentavos:
      completo.impedimentos.length > 0 ? 0 : completo.calculo.valorFinalEmCentavos,
    forma: completo.forma,
    avisos: completo.avisos,
    impedimentos: completo.impedimentos,
  };
}
