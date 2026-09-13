import { Module } from '@nestjs/common';
import { ReceituarioModule } from '../receituario/receituario.module';
import { DocumentoController } from './documento.controller';
import { DocumentoService } from './documento.service';
import { PublicoController } from './publico.controller';

/**
 * O documento da receita: o PDF, e o link que o tutor abre sem login.
 *
 * Módulo separado do receituário de propósito. O receituário decide o que a
 * receita **é**; este decide como ela **se apresenta** — e é o único lugar do
 * sistema que responde sem sessão, o que é mais fácil de revisar quando está
 * reunido num arquivo só (ADR 0013).
 */
@Module({
  imports: [ReceituarioModule],
  controllers: [DocumentoController, PublicoController],
  providers: [DocumentoService],
})
export class DocumentoModule {}
