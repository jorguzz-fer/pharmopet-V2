import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { formulacoesDoBularioSchema } from './bulario.dto';

/**
 * Importa o bulário magistral.
 *
 *   pnpm --filter @pharmopet/api bulario:importar
 *   pnpm --filter @pharmopet/api bulario:importar -- --arquivo outro.json
 *
 * O arquivo padrão é o que vem no repositório: 315 formulações extraídas dos
 * dezenove guias `.docx`, com o extrator ao lado em `dados/extrair.py`. Ele
 * pode entrar versionado, ao contrário do catálogo, porque não tem custo,
 * markup nem estoque — é o material que a farmácia já publica (ADR 0015).
 *
 * Comando e não migration, mesmo motivo de `catalogo:importar`: o conteúdo é da
 * instalação, e migration com dado da farmácia falharia — ou passaria — em toda
 * instalação que não fosse aquela.
 *
 * Idempotente, casando pelo número do guia. Rodar de novo atualiza o que mudou.
 */

/**
 * O JSON que vem junto, resolvido a partir deste arquivo e não do diretório de
 * quem chamou: o comando roda de qualquer lugar, e `dist/` espelha `src/`.
 *
 * `__dirname` porque a API compila para CommonJS — `import.meta.url` não existe
 * ali, e o erro só apareceria ao rodar.
 */
function caminhoPadrao(): string {
  return join(__dirname, 'dados', 'bulario.json');
}

async function principal(): Promise<void> {
  const { values } = parseArgs({ options: { arquivo: { type: 'string' } } });
  const caminho = values.arquivo ?? caminhoPadrao();

  const formulacoes = formulacoesDoBularioSchema.parse(
    JSON.parse(readFileSync(caminho, 'utf8')) as unknown,
  );

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);

  try {
    let criadas = 0;
    let atualizadas = 0;

    for (const f of formulacoes) {
      const campos = {
        titulo: f.titulo.trim(),
        linhaTerapeutica: f.linhaTerapeutica.trim(),
        linhaExclusiva: f.linhaExclusiva?.trim() || null,
        formaFarmaceutica: f.formaFarmaceutica?.trim() || null,
        indicacao: f.indicacao?.trim() || null,
        diferencial: f.diferencial?.trim() || null,
        composicao: f.composicao?.trim() || null,
        modoDeUsar: f.modoDeUsar?.trim() || null,
        observacoes: f.observacoes?.trim() || null,
        especies: f.especies,
      };

      const existente = await prisma.formulacaoDoBulario.findUnique({
        where: { numero: f.numero },
        select: { id: true },
      });

      if (existente) {
        await prisma.formulacaoDoBulario.update({ where: { id: existente.id }, data: campos });
        atualizadas += 1;
      } else {
        await prisma.formulacaoDoBulario.create({ data: { numero: f.numero, ...campos } });
        criadas += 1;
      }
    }

    console.log(`bulário      ${criadas} nova(s), ${atualizadas} atualizada(s)`);

    // Uma formulação renumerada entra como nova e a antiga fica. Dizer o total
    // deixa a diferença aparecer: 316 depois de importar 315 é renumeração.
    const total = await prisma.formulacaoDoBulario.count();
    if (total !== formulacoes.length) {
      console.warn(
        `\nO banco tem ${total} formulações e o arquivo trouxe ${formulacoes.length}.\n` +
          'A diferença é de guias importados antes com outra numeração. Confira antes de publicar.',
      );
    }
  } finally {
    await app.close();
  }
}

principal().catch((erro: unknown) => {
  process.stderr.write(`\n${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
});
