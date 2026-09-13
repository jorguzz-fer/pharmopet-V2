import { Module } from '@nestjs/common';
import { ClinicasModule } from '../clinicas/clinicas.module';
import { IdentidadeModule } from '../identidade/identidade.module';
import { ReceituarioModule } from '../receituario/receituario.module';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

/**
 * Pedidos: a peça entre prescrever e manipular (ADR 0014).
 *
 * Depende do receituário para achar a receita e conferir quem a enxerga — e a
 * dependência aponta só nesta direção. O receituário não sabe que existe
 * pedido, que é o que mantém a receita imutável enquanto o pedido anda.
 */
@Module({
  imports: [ReceituarioModule, IdentidadeModule, ClinicasModule],
  controllers: [PedidosController],
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
