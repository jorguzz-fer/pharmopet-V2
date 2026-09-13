import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ClinicasModule } from './clinicas/clinicas.module';
import { HealthModule } from './health/health.module';
import { IdentidadeModule } from './identidade/identidade.module';
import { PapeisGuard } from './identidade/papeis.guard';
import { SessaoGuard } from './identidade/sessao.guard';
import { PrismaModule } from './prisma/prisma.module';
import { ReceituarioModule } from './receituario/receituario.module';
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
    // Teto geral por IP. Rotas caras ou sensíveis apertam mais com @Throttle;
    // este número existe para nenhuma rota ficar sem limite nenhum por descuido.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    IdentidadeModule,
    CatalogoModule,
    ClinicasModule,
    ReceituarioModule,
    HealthModule,
  ],
  /**
   * Os três guards globais ficam aqui, e não espalhados pelos módulos, porque a
   * ordem é a da lista e a ordem tem consequência:
   *
   * 1. limite de requisições — recusar excesso não deveria custar ida ao banco;
   * 2. sessão — resolve quem está chamando, e recusa quem não tem;
   * 3. papel — decide o que essa pessoa pode. Invertido com o 2, autorizaria
   *    sem saber quem é.
   *
   * Registrados como APP_GUARD, valem para a aplicação inteira: um controller
   * escrito daqui a seis meses por quem nunca leu este arquivo já nasce
   * exigindo sessão, e abrir uma rota passa a ser um ato explícito.
   */
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessaoGuard },
    { provide: APP_GUARD, useClass: PapeisGuard },
  ],
})
export class AppModule {}
