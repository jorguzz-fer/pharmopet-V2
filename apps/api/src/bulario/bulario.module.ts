import { Module } from '@nestjs/common';
import { BularioController } from './bulario.controller';
import { BularioService } from './bulario.service';

/**
 * O bulário magistral: referência clínica, separada do catálogo (ADR 0015).
 *
 * Não depende de nenhum outro módulo, e nenhum depende dele. É de propósito:
 * nada do bulário entra numa receita, então uma seta entre os dois seria uma
 * porta aberta para alguém achar que entra.
 */
@Module({
  controllers: [BularioController],
  providers: [BularioService],
})
export class BularioModule {}
