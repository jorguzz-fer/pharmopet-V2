import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Eu } from '../identidade/decoradores';
import type { UsuarioAutenticado } from '../identidade/sessao.service';
import { DocumentoService } from './documento.service';
import { montarPdfDaReceita } from './receita.pdf';

@ApiTags('receituário')
@Controller('receituario/receitas')
export class DocumentoController {
  constructor(private readonly documentos: DocumentoService) {}

  @Get(':id/pdf')
  @ApiOperation({ summary: 'A receita emitida em PDF, para imprimir ou anexar' })
  @ApiProduces('application/pdf')
  // Documento de paciente identificado: não entra em cache compartilhado.
  @Header('Cache-Control', 'private, no-store')
  async pdf(
    @Param('id') id: string,
    @Eu() eu: UsuarioAutenticado,
    @Res() resposta: Response,
  ): Promise<void> {
    const documento = await this.documentos.porId(id, eu);

    responderComPdf(resposta, documento.numero, await montarPdfDaReceita(documento));
  }
}

/**
 * `inline`, e não `attachment`: o veterinário quase sempre quer conferir antes
 * de mandar, e forçar download para isso é um arquivo a mais na pasta dele.
 * O nome leva o número da receita porque é assim que a farmácia se refere a ela.
 */
export function responderComPdf(resposta: Response, numero: number, pdf: Buffer): void {
  resposta.setHeader('Content-Type', 'application/pdf');
  resposta.setHeader(
    'Content-Disposition',
    `inline; filename="receita-${String(numero).padStart(4, '0')}.pdf"`,
  );
  resposta.setHeader('Content-Length', pdf.length);
  resposta.end(pdf);
}
