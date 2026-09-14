import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Papeis } from '../identidade/decoradores';
import { montarCsv, reaisParaPlanilha } from './csv';
import { FiltroDoRelatorioDto, RelatorioDePrescricoesDto } from './relatorios.dto';
import { RelatoriosService, type RelatorioDePrescricoes } from './relatorios.service';

/**
 * Relatórios da operação.
 *
 * ADMIN e FARMACIA: é quem fecha conta com as clínicas. O veterinário tem os
 * números dele no painel — abrir o relatório a ele significaria mostrar o
 * volume dos colegas, que é a mesma razão de o ranking não aparecer lá.
 */
@ApiTags('relatorios')
@Papeis('ADMIN', 'FARMACIA')
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatorios: RelatoriosService) {}

  @Get('prescricoes')
  @ApiOperation({ summary: 'O que foi prescrito num mês, por veterinário e por clínica' })
  @ApiOkResponse({ type: RelatorioDePrescricoesDto })
  async prescricoes(@Query() filtro: FiltroDoRelatorioDto): Promise<RelatorioDePrescricoesDto> {
    return this.montar(filtro.mes);
  }

  /**
   * O mesmo relatório, em planilha.
   *
   * Rota separada e não um `?formato=csv`: o navegador baixa isto por
   * navegação normal — um link, não `fetch` —, e um caminho terminado em
   * `.csv` é o que faz o sistema operacional e o Excel reconhecerem o
   * arquivo. Como é navegação de topo, o cookie `SameSite=Lax` vai junto e o
   * download sai autenticado sem token na URL.
   */
  @Get('prescricoes.csv')
  @ApiOperation({ summary: 'O relatório do mês como planilha' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Planilha com uma linha por veterinário e por clínica.' })
  async csv(@Query() filtro: FiltroDoRelatorioDto, @Res() resposta: Response): Promise<void> {
    const relatorio = await this.montar(filtro.mes);

    const linhas = [
      ...relatorio.porVeterinario.map((l) => [
        'Veterinário',
        l.nome,
        l.detalhe ?? '',
        String(l.receitas),
        reaisParaPlanilha(l.valorEmCentavos),
      ]),
      ...relatorio.porClinica.map((l) => [
        'Clínica',
        l.nome,
        '',
        String(l.receitas),
        reaisParaPlanilha(l.valorEmCentavos),
      ]),
    ];

    const conteudo = montarCsv(
      ['Quebra', 'Nome', 'CRMV', 'Receitas', 'Valor prescrito (R$)'],
      linhas,
    );

    resposta.setHeader('content-type', 'text/csv; charset=utf-8');
    resposta.setHeader(
      'content-disposition',
      `attachment; filename="prescricoes-${relatorio.mes}.csv"`,
    );
    resposta.send(conteudo);
  }

  /**
   * O `RangeError` do período vira 400, e não 500.
   *
   * O schema já barra a forma; o que chega aqui é mês possível na forma e
   * impossível no calendário — `2026-13`. Deixar subir daria "erro interno"
   * sobre um dado que a pessoa digitou e pode corrigir.
   */
  private async montar(mes?: string): Promise<RelatorioDePrescricoes> {
    try {
      return await this.relatorios.prescricoes(mes);
    } catch (erro) {
      if (erro instanceof RangeError) throw new BadRequestException(erro.message);
      throw erro;
    }
  }
}
