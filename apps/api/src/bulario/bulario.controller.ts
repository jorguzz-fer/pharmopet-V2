import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FormulacaoDoBulario } from '@prisma/client';
import {
  FiltroDoBularioDto,
  FormulacaoDoBularioDto,
  LinhasDoBularioDto,
  ListaDoBularioDto,
  ResumoDoBularioDto,
} from './bulario.dto';
import { BularioService } from './bulario.service';

/**
 * O bulário magistral.
 *
 * Sem `@Papeis`: quem tem sessão lê. É material de referência clínica — não há
 * custo, markup nem clientela aqui —, e esconder do veterinário o que a
 * farmácia já lhe manda por e-mail não protegeria nada. A ADR 0015 explica.
 */
@ApiTags('bulário')
@Controller('bulario')
export class BularioController {
  constructor(private readonly bulario: BularioService) {}

  @Get()
  @ApiOperation({ summary: 'Busca formulações por doença, ativo ou nome' })
  @ApiOkResponse({ type: ListaDoBularioDto })
  async listar(@Query() filtro: FiltroDoBularioDto): Promise<ListaDoBularioDto> {
    const { formulacoes, total } = await this.bulario.listar(filtro);

    return { formulacoes: formulacoes.map(resumir), total };
  }

  /**
   * Antes de `:id`, senão "linhas" seria lido como um identificador — o mesmo
   * cuidado das rotas `receitas/nova` e `clinicas/nova` no front.
   */
  @Get('linhas')
  @ApiOperation({ summary: 'As linhas terapêuticas, com quantas formulações cada uma tem' })
  @ApiOkResponse({ type: LinhasDoBularioDto })
  async linhas(): Promise<LinhasDoBularioDto> {
    return { linhas: await this.bulario.linhas() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Uma formulação inteira, como o guia a escreve' })
  @ApiOkResponse({ type: FormulacaoDoBularioDto })
  async achar(@Param('id') id: string): Promise<FormulacaoDoBularioDto> {
    const f = await this.bulario.achar(id);

    return {
      ...resumir(f),
      diferencial: f.diferencial,
      composicao: f.composicao,
      modoDeUsar: f.modoDeUsar,
      observacoes: f.observacoes,
    };
  }
}

function resumir(f: FormulacaoDoBulario): ResumoDoBularioDto {
  return {
    id: f.id,
    numero: f.numero,
    titulo: f.titulo,
    linhaTerapeutica: f.linhaTerapeutica,
    linhaExclusiva: f.linhaExclusiva,
    formaFarmaceutica: f.formaFarmaceutica,
    indicacao: f.indicacao,
    especies: f.especies,
  };
}
