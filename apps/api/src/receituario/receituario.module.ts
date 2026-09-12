import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { IdentidadeModule } from '../identidade/identidade.module';
import { CadastroController } from './cadastro.controller';
import { CadastroService } from './cadastro.service';
import { ReceitaController } from './receita.controller';
import { ReceitaService } from './receita.service';

/**
 * Receituário: tutor, paciente e receita.
 *
 * Depende do catálogo para precificar e conferir dose, e da identidade para
 * auditar a emissão. A dependência aponta numa direção só — o catálogo não
 * sabe que existe receita, e é o que permite reimportar o catálogo da farmácia
 * sem tocar em nada daqui.
 */
@Module({
  imports: [CatalogoModule, IdentidadeModule],
  controllers: [CadastroController, ReceitaController],
  providers: [CadastroService, ReceitaService],
  exports: [CadastroService, ReceitaService],
})
export class ReceituarioModule {}
