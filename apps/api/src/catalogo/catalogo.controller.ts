import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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
  AlterarFormaDto,
  AlterarInsumoDto,
  CondicoesDto,
  CriarFaixaDto,
  CriarFormaDto,
  CriarInsumoDto,
  CriarRestricaoDto,
  FaixaDto,
  faltaListaDeControle,
  FormaDto,
  InsumoAdminDto,
  LISTA_OBRIGATORIA,
  ListaDeFormasDto,
  ListaDeInsumosDto,
  ListaDeRestricoesDto,
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

  /**
   * Um insumo com os números comerciais.
   *
   * Separado da busca de propósito: a busca alimenta a tela de quem prescreve,
   * e custo e markup não trafegam até lá. Quem administra precisa deles para
   * corrigir, e pede um por vez.
   */
  @Papeis('ADMIN')
  @Get('insumos/:id')
  @ApiOperation({ summary: 'Um insumo, com custo e markup' })
  @ApiOkResponse({ type: InsumoAdminDto })
  async insumo(@Param('id') id: string): Promise<InsumoAdminDto> {
    const insumo = await this.prisma.insumo.findUnique({
      where: { id },
      include: { restricoes: { include: { forma: true } } },
    });

    if (!insumo) throw new NotFoundException('Insumo não encontrado.');

    return {
      id: insumo.id,
      codigo: insumo.codigo,
      descricao: insumo.descricao,
      controlado: insumo.controlado,
      listaDeControle: insumo.listaDeControle,
      estoque: situacaoDoEstoque(insumo.estoqueEmMiligramas),
      formasProibidas: insumo.restricoes.map((r) => ({
        formaId: r.forma.id,
        nome: r.forma.nome,
        motivo: r.motivo,
      })),
      custoPorGramaEmMicro: insumo.custoPorGramaEmMicro,
      custoDeReferenciaPorGramaEmMicro: insumo.custoDeReferenciaPorGramaEmMicro,
      markupEmCentesimos: insumo.markupEmCentesimos,
      estoqueEmMiligramas: insumo.estoqueEmMiligramas,
    };
  }

  /**
   * Todas as proibições, num lugar só.
   *
   * A busca de insumo devolve no máximo cinquenta linhas, então juntar as
   * proibições a partir dela mostraria só as desses cinquenta. Quem administra
   * precisa da lista inteira — ela é curta, e é o tipo de regra que se revisa
   * junta.
   */
  @Papeis('ADMIN')
  @Get('restricoes')
  @ApiOperation({ summary: 'Todas as proibições de insumo por forma' })
  @ApiOkResponse({ type: ListaDeRestricoesDto })
  async restricoes(): Promise<ListaDeRestricoesDto> {
    const registros = await this.prisma.restricaoDeForma.findMany({
      include: {
        insumo: { select: { id: true, codigo: true, descricao: true } },
        forma: { select: { id: true, nome: true } },
      },
      orderBy: [{ insumo: { descricao: 'asc' } }, { forma: { nome: 'asc' } }],
    });

    return {
      restricoes: registros.map((r) => ({
        insumoId: r.insumo.id,
        insumoCodigo: r.insumo.codigo,
        insumoDescricao: r.insumo.descricao,
        formaId: r.forma.id,
        formaNome: r.forma.nome,
        motivo: r.motivo,
      })),
    };
  }

  /**
   * Corrige um insumo já cadastrado.
   *
   * Existe porque o importador não sabe tudo: ele traz preço e descrição do
   * export, e deixa de fora o que o export não diz — se é controlado, por qual
   * lista, quanto há em estoque. Sem esta rota, corrigir qualquer uma dessas
   * coisas exigia acesso ao banco.
   */
  @Papeis('ADMIN')
  @Patch('insumos/:id')
  @ApiOperation({ summary: 'Altera um insumo' })
  @ApiOkResponse({ type: InsumoAdminDto })
  async alterarInsumo(
    @Param('id') id: string,
    @Body() corpo: AlterarInsumoDto,
  ): Promise<InsumoAdminDto> {
    const atual = await this.prisma.insumo.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Insumo não encontrado.');

    // Contra o resultado, e não contra o que veio no corpo: marcar `controlado`
    // sem tocar na lista, ou apagar a lista de quem já é controlado, chegam
    // aqui como corpos diferentes e deixam o mesmo estado inválido.
    const controlado = corpo.controlado ?? atual.controlado;
    const lista =
      corpo.listaDeControle === undefined ? atual.listaDeControle : corpo.listaDeControle;

    if (faltaListaDeControle(controlado, lista)) throw new BadRequestException(LISTA_OBRIGATORIA);

    const alterado = await this.prisma.insumo.update({
      where: { id },
      data: {
        ...(corpo.descricao !== undefined ? { descricao: corpo.descricao.trim() } : {}),
        ...(corpo.custoPorGramaEmMicro !== undefined
          ? { custoPorGramaEmMicro: corpo.custoPorGramaEmMicro }
          : {}),
        ...(corpo.custoDeReferenciaPorGramaEmMicro !== undefined
          ? { custoDeReferenciaPorGramaEmMicro: corpo.custoDeReferenciaPorGramaEmMicro }
          : {}),
        ...(corpo.markupEmCentesimos !== undefined
          ? { markupEmCentesimos: corpo.markupEmCentesimos }
          : {}),
        ...(corpo.estoqueEmMiligramas !== undefined
          ? { estoqueEmMiligramas: corpo.estoqueEmMiligramas }
          : {}),
        controlado,
        // Deixa de ser controlado, deixa de ter lista: uma lista órfã voltaria
        // a valer inteira se alguém remarcasse o controlado mais tarde.
        listaDeControle: controlado ? (lista?.trim().toUpperCase() ?? null) : null,
      },
      include: { restricoes: { include: { forma: true } } },
    });

    return {
      id: alterado.id,
      codigo: alterado.codigo,
      descricao: alterado.descricao,
      controlado: alterado.controlado,
      listaDeControle: alterado.listaDeControle,
      estoque: situacaoDoEstoque(alterado.estoqueEmMiligramas),
      formasProibidas: alterado.restricoes.map((r) => ({
        formaId: r.forma.id,
        nome: r.forma.nome,
        motivo: r.motivo,
      })),
      custoPorGramaEmMicro: alterado.custoPorGramaEmMicro,
      custoDeReferenciaPorGramaEmMicro: alterado.custoDeReferenciaPorGramaEmMicro,
      markupEmCentesimos: alterado.markupEmCentesimos,
      estoqueEmMiligramas: alterado.estoqueEmMiligramas,
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

  /**
   * Corrige uma forma farmacêutica.
   *
   * O `aceitaAroma` é o que mais precisa disto: o importador o chuta a partir
   * do nome — o arquivo da farmácia traz só nomes — e chutar para menos esconde
   * o seletor de sabor numa forma que o aceitaria.
   */
  @Papeis('ADMIN')
  @Patch('formas/:id')
  @ApiOperation({ summary: 'Altera uma forma farmacêutica' })
  @ApiOkResponse({ type: FormaDto })
  async alterarForma(@Param('id') id: string, @Body() corpo: AlterarFormaDto): Promise<FormaDto> {
    const atual = await this.prisma.formaFarmaceutica.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Forma farmacêutica não encontrada.');

    const alterada = await this.prisma.formaFarmaceutica.update({
      where: { id },
      data: {
        ...(corpo.aceitaAroma !== undefined ? { aceitaAroma: corpo.aceitaAroma } : {}),
        // Reativar limpa a data; desativar só marca se ainda não estava — senão
        // reenviar o mesmo corpo moveria a data para hoje e apagaria quando foi.
        ...(corpo.desativada === undefined
          ? {}
          : corpo.desativada
            ? { desativadaEm: atual.desativadaEm ?? new Date() }
            : { desativadaEm: null }),
      },
    });

    return { id: alterada.id, nome: alterada.nome, aceitaAroma: alterada.aceitaAroma };
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

  /**
   * Levanta uma proibição.
   *
   * Pelo par insumo+forma, e não por um id de restrição: é assim que a restrição
   * é identificada em todo o resto — a chave única da tabela, o `upsert` acima e
   * o `formasProibidas` que a tela recebe, que traz `formaId` e não o id da
   * linha. Um id só para apagar obrigaria a expor um identificador a mais.
   *
   * Apagar é o certo aqui, e não desativar: a restrição é cadastro de hoje, e
   * uma receita que dependeu dela já guarda o impedimento no que foi emitido.
   */
  @Papeis('ADMIN')
  @Delete('restricoes/:insumoId/:formaId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a proibição de um insumo numa forma' })
  async removerRestricao(
    @Param('insumoId') insumoId: string,
    @Param('formaId') formaId: string,
  ): Promise<void> {
    const existente = await this.prisma.restricaoDeForma.findUnique({
      where: { insumoId_formaId: { insumoId, formaId } },
      select: { id: true },
    });

    // 404 e não 204: apagar o que não existe "dar certo" esconde id errado, e
    // quem levantou uma proibição precisa saber se levantou mesmo.
    if (!existente) throw new NotFoundException('Esta proibição não está cadastrada.');

    await this.prisma.restricaoDeForma.delete({ where: { id: existente.id } });
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
