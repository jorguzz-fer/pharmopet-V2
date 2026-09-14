import { Module } from '@nestjs/common';
import { IdentidadeModule } from '../identidade/identidade.module';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';

/**
 * Relatórios.
 *
 * Só lê, e lê direto do Prisma. Não importa `ReceituarioModule`: puxaria
 * serviços de escrita para não usar consulta nenhuma deles, e prenderia o
 * relatório às decisões de um módulo que tem outro dono.
 */
@Module({
  imports: [IdentidadeModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
})
export class RelatoriosModule {}
