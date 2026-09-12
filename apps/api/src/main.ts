import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validarEnv } from './config/env';
import { criarDocumentoOpenApi } from './openapi/documento';

async function bootstrap(): Promise<void> {
  // Falha cedo e com mensagem clara se a configuração estiver incompleta.
  const env = validarEnv(process.env);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet());

  // A API é versionada desde o primeiro endpoint: quebrar contrato depois
  // custa muito mais do que carregar o prefixo agora.
  app.setGlobalPrefix('api/v1');

  // Uma só linguagem de schema no projeto: os DTOs nascem de schemas Zod
  // (via createZodDto), que servem tanto à validação quanto ao OpenAPI.
  app.useGlobalPipes(new ZodValidationPipe());

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
