import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cadastra as restrições de forma pedidas na reunião de 11/09.
 *
 * Pancreatina, ciclosporina e SAM não se manipulam em biscoito — só em cápsula.
 * O sistema já sabe barrar a combinação: `RestricaoDeForma` existe desde a fase
 * 3 e o orçamento a devolve como impedimento, que trava a emissão. O que falta
 * é o dado.
 *
 * É comando, e não migration, porque depende de quais insumos estão cadastrados
 * naquela instalação — e os códigos do catálogo da farmácia não são os mesmos
 * do banco de teste. Uma migration com ids fixos falharia em toda instalação
 * que não fosse aquela onde foi escrita.
 *
 *   pnpm --filter @pharmopet/api catalogo:restricoes
 *
 * Idempotente: rodar de novo não duplica nem sobrescreve motivo já ajustado à
 * mão. Diz o que fez e o que não achou.
 */

/** Busca parcial, porque a descrição do catálogo varia: "PANCREATINA 200MG". */
const ATIVOS = ['pancreatina', 'ciclosporina', 'sam-e'];

/**
 * `sam-e` e não `sam`: SAM é S-adenosil-metionina, e procurar por "sam" casaria
 * com qualquer descrição que contivesse essas três letras — "SAMPLE", "BÁLSAMO".
 * Uma restrição a mais bloqueia uma fórmula legítima e some no meio do
 * atendimento, então a busca erra para o lado de achar de menos e avisar.
 */
const TERMOS_ALTERNATIVOS: Readonly<Record<string, readonly string[]>> = {
  'sam-e': ['sam-e', 'adenosil', 'ademetionina'],
};

const FORMA = 'BISCOITO';
const MOTIVO = 'Não se manipula em biscoito — somente em cápsula.';

async function principal(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);

  try {
    const formas = await prisma.formaFarmaceutica.findMany({
      where: { nome: { contains: FORMA, mode: 'insensitive' }, desativadaEm: null },
      select: { id: true, nome: true },
    });

    if (formas.length === 0) {
      console.error(`Nenhuma forma farmacêutica com "${FORMA}" no nome. Cadastre-a antes.`);
      process.exitCode = 1;
      return;
    }

    let criadas = 0;
    let jaExistiam = 0;
    const semInsumo: string[] = [];

    for (const ativo of ATIVOS) {
      const termos = TERMOS_ALTERNATIVOS[ativo] ?? [ativo];
      const insumos = await prisma.insumo.findMany({
        where: { OR: termos.map((t) => ({ descricao: { contains: t, mode: 'insensitive' } })) },
        select: { id: true, codigo: true, descricao: true },
      });

      if (insumos.length === 0) {
        semInsumo.push(ativo);
        continue;
      }

      for (const insumo of insumos) {
        for (const forma of formas) {
          const existente = await prisma.restricaoDeForma.findUnique({
            where: { insumoId_formaId: { insumoId: insumo.id, formaId: forma.id } },
            select: { id: true },
          });

          if (existente) {
            jaExistiam += 1;
            continue;
          }

          await prisma.restricaoDeForma.create({
            data: { insumoId: insumo.id, formaId: forma.id, motivo: MOTIVO },
          });
          console.log(`  + ${insumo.descricao} (${insumo.codigo}) × ${forma.nome}`);
          criadas += 1;
        }
      }
    }

    console.log(`\n${criadas} restrição(ões) criada(s), ${jaExistiam} já existia(m).`);

    if (semInsumo.length > 0) {
      // Avisa alto: silêncio aqui seria lido como "está tudo cadastrado", e o
      // ativo seguiria disponível em biscoito.
      console.warn(
        `\nSem insumo cadastrado para: ${semInsumo.join(', ')}.\n` +
          'Estes continuam SEM restrição. Cadastre o insumo e rode de novo.',
      );
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void principal();
