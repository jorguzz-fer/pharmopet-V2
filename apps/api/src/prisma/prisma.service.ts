import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Acesso ao banco.
 *
 * Uma instância só, com o ciclo de vida amarrado ao do Nest: conectar no boot
 * faz a aplicação falhar cedo se o banco não estiver lá, em vez de aceitar
 * requisição e só então descobrir. E desconectar no encerramento evita conexão
 * pendurada a cada reinício em desenvolvimento.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('conectado ao banco');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
