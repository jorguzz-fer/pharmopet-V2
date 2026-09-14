import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { validarEnv } from './config/env';
import { limitesDeCorpo } from './http/corpo';
import { IdMalformadoFiltro } from './http/id-malformado.filtro';
import { criarDocumentoOpenApi } from './openapi/documento';

async function bootstrap(): Promise<void> {
  // Falha cedo e com mensagem clara se a configuração estiver incompleta.
  const env = validarEnv(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  app.use(helmet());
  app.use(cookieParser());

  app.use(limitesDeCorpo());

  // Atrás de proxy reverso, req.ip seria sempre o IP do proxy — e o limite por
  // IP viraria um limite global, com um cliente hostil derrubando todos os
  // outros. Confia só no salto imediato: X-Forwarded-For é cabeçalho livre, e
  // confiar na cadeia inteira deixaria qualquer um forjar o próprio IP.
  app.set('trust proxy', 1);

  // A API é versionada desde o primeiro endpoint: quebrar contrato depois
  // custa muito mais do que carregar o prefixo agora.
  app.setGlobalPrefix('api/v1');

  // Uma só linguagem de schema no projeto: os DTOs nascem de schemas Zod
  // (via createZodDto), que servem tanto à validação quanto ao OpenAPI.
  app.useGlobalPipes(new ZodValidationPipe());

  // Id que não é UUID vira 400, e não 500. Filtro e não pipe por rota: pipe é
  // coisa que se esquece na rota seguinte.
  app.useGlobalFilters(new IdMalformadoFiltro(app.get(HttpAdapterHost).httpAdapter));

  // Origens vêm do ambiente. Sem nenhuma configurada, o navegador não é
  // liberado — integrações server-to-server não passam por CORS.
  app.enableCors({
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
  });

  // OpenAPI é a fonte de verdade do contrato: o cliente é gerado a partir
  // daqui, nunca escrito à mão. Mesmo documento que o gerador do api-client
  // escreve em disco — um construtor só, para não haver dois contratos.
  const documento = criarDocumentoOpenApi(app);
  SwaggerModule.setup('api/docs', app, documento, {
    jsonDocumentUrl: 'api/openapi.json',
  });

  await app.listen(env.PORT);
  new Logger('bootstrap').log(`API em http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
}

void bootstrap();
