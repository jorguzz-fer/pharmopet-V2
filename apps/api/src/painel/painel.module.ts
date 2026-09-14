import { Module } from '@nestjs/common';
import { ClinicasModule } from '../clinicas/clinicas.module';
import { IdentidadeModule } from '../identidade/identidade.module';
import { PainelController } from './painel.controller';
import { PainelService } from './painel.service';

/**
 * O painel (ADR 0017).
 *
 * Só lê, e lê de tudo: receita, pedido e usuário. Por isso não depende de
 * `ReceituarioModule` nem de `PedidosModule` — importaria serviços de escrita
 * para usar consulta nenhuma deles, e criaria um ciclo de módulos por
 * conveniência. O que ele reaproveita do receituário é a **regra** de
 * visibilidade (`escopo.ts`), que é função pura e não precisa de módulo.
 */
@Module({
  imports: [ClinicasModule, IdentidadeModule],
  controllers: [PainelController],
  providers: [PainelService],
})
export class PainelModule {}
