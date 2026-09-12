import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { criarDocumentoOpenApi } from './documento';

/**
 * Escreve o contrato em apps/api/openapi.json.
 *
 * O arquivo é versionado de propósito: é ele que o api-client consome, e é a
 * diferença dele num PR que mostra, em revisão, que o contrato mudou. O CI
 * regera e compara — se o commit não trouxer o contrato atualizado, quebra.
 */

const DESTINO = resolve(__dirname, '../../openapi.json');

async function gerar(): Promise<void> {
  // O AppModule valida o ambiente já na avaliação do decorador, ou seja, no
  // import. Por isso ele entra por import dinâmico, depois destes valores:
  // com um import estático o módulo subiria antes e a validação falharia.
  //
  // Aqui nada é conectado — o documento sai só da metadata dos decoradores,
  // sem tocar banco nem abrir porta. Estes valores nunca são usados.
  process.env.NODE_ENV ??= 'development';
  process.env.DATABASE_URL ??= 'postgresql://gerador:gerador@localhost:5432/gerador';

  const { AppModule } = await import('../app.module');

  // Sem logger: a saída útil deste comando é o arquivo, não o ruído do boot.
  // `abortOnError: false` porque o padrão do Nest é registrar a falha no
  // logger e encerrar — com o logger desligado, o comando morreria mudo.
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });

  // O prefixo precisa ser o mesmo do main.ts, senão os caminhos do contrato
  // gerado não batem com os caminhos que o servidor de fato atende.
  app.setGlobalPrefix('api/v1');
  await app.init();

  const documento = criarDocumentoOpenApi(app);
  writeFileSync(DESTINO, `${JSON.stringify(documento, null, 2)}\n`);
  await app.close();

  process.stdout.write(`contrato escrito em ${DESTINO}\n`);
}

gerar().catch((erro: unknown) => {
  process.stderr.write(`${erro instanceof Error ? erro.stack : String(erro)}\n`);
  process.exitCode = 1;
});
