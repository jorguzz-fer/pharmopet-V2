import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { validarEnv } from './config/env';

/**
 * Raiz do monólito modular. Cada domínio entra aqui como um módulo com
 * fronteira própria; a dependência aponta para dentro, nunca para a borda.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
    }),
    HealthModule,
  ],
})
export class AppModule {}
