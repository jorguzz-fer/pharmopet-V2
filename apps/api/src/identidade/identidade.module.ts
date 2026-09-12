import { Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { IdentidadeController } from './identidade.controller';
import { IdentidadeService } from './identidade.service';
import { SenhaService } from './senha.service';
import { SessaoService } from './sessao.service';

/**
 * Identidade e acesso.
 *
 * Exporta os serviços porque os guards globais, declarados no AppModule, vivem
 * fora daqui — a ordem deles tem consequência de segurança e por isso está num
 * lugar só, à vista, em vez de dividida entre módulos.
 */
@Module({
  controllers: [IdentidadeController],
  providers: [SenhaService, SessaoService, AuditoriaService, IdentidadeService],
  exports: [SenhaService, SessaoService, AuditoriaService, IdentidadeService],
})
export class IdentidadeModule {}
