import { Module } from '@nestjs/common';
import { CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

/**
 * Catálogo e precificação.
 *
 * O módulo carrega dado e traduz; a aritmética de preço e a conferência de dose
 * moram em `@pharmopet/shared`, como função pura. É o que mantém a regra de
 * negócio testável sem banco — e é onde a v1 errava, com a fórmula do preço
 * enterrada num serviço que abria conexão para calcular.
 */
@Module({
  controllers: [CatalogoController],
  providers: [CatalogoService],
  exports: [CatalogoService],
})
export class CatalogoModule {}
