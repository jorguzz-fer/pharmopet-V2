import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Monta o documento OpenAPI da API.
 *
 * Mora aqui, e não no boot, porque tem dois consumidores: o servidor, que o
 * publica em /api/docs, e o gerador do pacote api-client. Se cada um montasse
 * o seu, o contrato servido e o contrato gerado poderiam divergir sem ninguém
 * notar — que é exatamente o drift que a geração existe para evitar.
 */
export function criarDocumentoOpenApi(app: INestApplication): OpenAPIObject {
  return cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('PharmoPet API')
        .setDescription('Prescrição e manipulação veterinária')
        .setVersion('1.0.0')
        .setOpenAPIVersion('3.1.0')
        .build(),
    ),
  );
}
