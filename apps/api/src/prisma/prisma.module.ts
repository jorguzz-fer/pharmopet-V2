import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global porque persistência é infraestrutura, não domínio: obrigar cada módulo
 * a importar o Prisma só espalharia ruído. O que continua valendo é a regra de
 * dependência — módulo de domínio fala com o banco pelo seu próprio repositório,
 * não espalha consulta pela borda.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
