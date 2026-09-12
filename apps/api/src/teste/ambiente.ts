import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ZodValidationPipe } from 'nestjs-zod';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Aplicação de verdade, contra Postgres de verdade.
 *
 * Dublê de banco testa o dublê. O que precisa ser verificado aqui — que o índice
 * único de e-mail segura, que a sessão deixa de resolver depois de revogada, que
 * o enum de papel existe do lado do banco — só aparece contra o Postgres, e é
 * por isso que estes testes exigem um.
 *
 * A montagem replica a do `main.ts` de propósito: subir sem o `cookie-parser` ou
 * sem o pipe de validação seria testar outra aplicação, e passar verde sobre um
 * sistema quebrado.
 */
export async function subirAplicacao(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'Os testes de integração precisam de DATABASE_URL. Suba o banco com `pnpm infra:up` ' +
        'e aplique as migrations com `pnpm --filter @pharmopet/api prisma:migrate`.',
    );
  }

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  app.use(cookieParser());
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ZodValidationPipe());
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

let contadorDeIp = 0;

/** Endereço novo a cada chamada, dentro de uma faixa privada. */
export function ipDeTeste(): string {
  contadorDeIp += 1;
  return `10.${(contadorDeIp >> 16) & 255}.${(contadorDeIp >> 8) & 255}.${contadorDeIp & 255}`;
}

/**
 * Cliente HTTP com origem própria.
 *
 * O limitador por IP fica ligado nos testes — desligá-lo esconderia justamente
 * o que ele faz, e um dos testes existe para provar que ele age. Em troca, cada
 * teste fala de um endereço diferente, como clientes diferentes de fato falam.
 * Sem isso, a suíte inteira somaria no mesmo balde e o terceiro teste começaria
 * a levar 429 — falha real, diagnóstico difícil, e a tentação de desligar a
 * defesa para "consertar" o teste.
 */
export function cliente(app: INestApplication, ip: string = ipDeTeste()) {
  const servidor = app.getHttpServer() as Parameters<typeof request>[0];
  const comOrigem = (chamada: request.Test): request.Test => chamada.set('X-Forwarded-For', ip);

  return {
    ip,
    get: (caminho: string) => comOrigem(request(servidor).get(caminho)),
    post: (caminho: string) => comOrigem(request(servidor).post(caminho)),
  };
}

/**
 * Zera as tabelas entre testes.
 *
 * `TRUNCATE ... CASCADE` numa ida só, em vez de apagar registro a registro: não
 * depende de a ordem de exclusão respeitar as chaves estrangeiras — ordem que
 * mudaria a cada tabela nova.
 */
export async function limparBanco(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "evento_de_auditoria", "sessao", "usuario" RESTART IDENTITY CASCADE',
  );
}

function setCookies(resposta: { headers: Record<string, unknown> }): string[] {
  const bruto = resposta.headers['set-cookie'];
  return Array.isArray(bruto) ? (bruto as string[]) : [];
}

/** O valor do cookie, como o navegador o guardaria. */
export function cookieDa(resposta: { headers: Record<string, unknown> }, nome: string): string {
  const achado = setCookies(resposta).find((c) => c.startsWith(`${nome}=`));
  if (!achado) throw new Error(`A resposta não trouxe o cookie ${nome}.`);

  return achado.split(';')[0]!.split('=').slice(1).join('=');
}

/** O `Set-Cookie` inteiro, para conferir atributos como HttpOnly e SameSite. */
export function diretivasDoCookie(
  resposta: { headers: Record<string, unknown> },
  nome: string,
): string {
  const achado = setCookies(resposta).find((c) => c.startsWith(`${nome}=`));
  if (!achado) throw new Error(`A resposta não trouxe o cookie ${nome}.`);

  return achado;
}
