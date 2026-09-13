import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { ClinicasController } from './clinicas.controller';
import { ClinicasService } from './clinicas.service';

/**
 * Clínicas parceiras (ADR 0012).
 *
 * Exporta o serviço porque dois módulos dependem dele: o catálogo, para saber
 * de quem são as condições comerciais do orçamento, e o receituário, para
 * saber quem enxerga qual clientela.
 */
@Module({
  imports: [IdentidadeModule],
  controllers: [ClinicasController],
  providers: [ClinicasService],
  exports: [ClinicasService],
})
export class ClinicasModule {}
