import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Publica } from '../identidade/decoradores';
import { responderComPdf } from './documento.controller';
import { DocumentoService } from './documento.service';
import { ReceitaPublicaDto } from './documento.dto';
import { montarPdfDaReceita } from './receita.pdf';

/**
 * A receita para o tutor, sem login.
 *
 * As duas únicas rotas do sistema abertas depois do login (ADR 0013). O que
 * autoriza é o token de 32 bytes gerado na emissão, e o que limita o dano de
 * alguém varrer tokens é o teto abaixo: sem sessão para bloquear, o que sobra
 * é o IP.
 *
 * Trinta por minuto é folgado para uma pessoa — abrir a página, recarregar,
 * baixar o PDF — e curto para quem está adivinhando: com 2^256 possibilidades,
 * não existe varredura que compense, e o limite só evita o barulho.
 */
@ApiTags('público')
@Controller('publico/receitas')
@Publica()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PublicoController {
  constructor(private readonly documentos: DocumentoService) {}

  @Get(':token')
  @ApiOperation({ summary: 'A receita que o tutor abre pelo link' })
  @ApiOkResponse({ type: ReceitaPublicaDto })
  @ApiNotFoundResponse({ description: 'Link inválido, ou receita ainda não emitida.' })
  @Header('Cache-Control', 'private, no-store')
  async consultar(@Param('token') token: string): Promise<ReceitaPublicaDto> {
    return this.documentos.resumoPorToken(token);
  }

  @Get(':token/pdf')
  @ApiOperation({ summary: 'O PDF da receita, pelo mesmo link' })
  @ApiProduces('application/pdf')
  @ApiNotFoundResponse({ description: 'Link inválido, ou receita ainda não emitida.' })
  @Header('Cache-Control', 'private, no-store')
  async pdf(@Param('token') token: string, @Res() resposta: Response): Promise<void> {
    const documento = await this.documentos.porToken(token);

    responderComPdf(resposta, documento.numero, await montarPdfDaReceita(documento));
  }
}
