import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { conferir, mesmaSubstancia, type InsumoConvertido } from './classificacao';

/**
 * Importa o catálogo exportado pela farmácia.
 *
 * A metade que faltava: `catalogo:conferir` diz o que entra, e este põe.
 * Nenhuma linha entra por outro caminho — o que a conferência bloqueia fica de
 * fora aqui também, e sai no relatório com nome e código.
 *
 *   pnpm --filter @pharmopet/api catalogo:importar -- \
 *     --formas data/formas.json \
 *     --insumos data/insumos.json \
 *     --controlados data/controlados.json \
 *     --excecoes data/excecoes.json
 *
 * Cada arquivo é opcional e independente: dá para importar só as formas, ou só
 * reaplicar os controlados depois de um export novo.
 *
 * Comando e não migration, pelo mesmo motivo da `catalogo:restricoes`: o
 * conteúdo é de cada instalação, e uma migration com dado da farmácia falharia
 * — ou, pior, passaria — em toda instalação que não fosse aquela.
 *
 * Idempotente. Rodar de novo atualiza preço e descrição de quem já existe, sem
 * duplicar e sem apagar o que foi ajustado à mão fora dos campos do export.
 */

/** Os nomes das formas, uma lista de strings. */
const formasSchema = z.array(z.string().min(1));

/** Quais insumos são controlados, e por qual lista da Portaria 344/98. */
const controladosSchema = z.array(
  z.object({ codigo: z.number(), nome: z.string(), lista: z.string().min(1) }),
);

/** "Não faz em pasta": o insumo, e a regra em texto. */
const excecoesSchema = z.array(
  z.object({ codigo: z.number(), produto: z.string(), regra: z.string().min(1) }),
);

/**
 * De regra escrita para forma cadastrada.
 *
 * Tabela explícita, e não a regra usada como nome: a V1 caía para
 * `exc.regra` quando não achava a chave, procurava uma forma chamada "NÃO FAZ
 * EM PASTA", não achava, e seguia. O efeito era uma restrição que ninguém
 * cadastrou e que não aparecia em lugar nenhum. Aqui, regra desconhecida é
 * erro visível.
 */
const FORMA_DA_REGRA: Readonly<Record<string, string>> = {
  'NÃO FAZ EM PASTA': 'PASTA ORAL',
};

/**
 * As formas em que o animal sente gosto, e que portanto pedem aroma.
 *
 * Sai daqui e não do arquivo porque `formas.json` traz só o nome. A lista é
 * conservadora de propósito: só o que é engolido ou lambido. Errar para menos
 * esconde o seletor de sabor numa forma que o aceitaria — chato, e corrigível
 * na tela; errar para mais oferece sabor num colírio, que é a farmácia
 * recebendo um pedido que não sabe produzir.
 *
 * Cadastro, não verdade: a coluna `aceitaAroma` é editável, e o comando não
 * sobrescreve o que já está lá.
 */
const COM_AROMA = new Set(['BISCOITOS', 'PASTA ORAL', 'SUSPENSÃO ORAL', 'PÓ ORAL', 'SACHÊ']);

function ler(caminho: string): unknown {
  return JSON.parse(readFileSync(caminho, 'utf8'));
}

type Contagem = { criados: number; atualizados: number };

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      formas: { type: 'string' },
      insumos: { type: 'string' },
      controlados: { type: 'string' },
      excecoes: { type: 'string' },
    },
  });

  if (!values.formas && !values.insumos && !values.controlados && !values.excecoes) {
    throw new Error(
      'Informe ao menos um arquivo: --formas, --insumos, --controlados ou --excecoes.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const avisos: string[] = [];

  try {
    if (values.formas) {
      const nomes = formasSchema.parse(ler(values.formas));
      const { criados, atualizados } = await importarFormas(prisma, nomes);
      console.log(`formas        ${criados} nova(s), ${atualizados} já existia(m)`);
    }

    if (values.insumos) {
      const bruto = ler(values.insumos);
      if (!Array.isArray(bruto)) throw new Error('O arquivo de insumos precisa ser uma lista.');

      const relatorio = conferir(bruto);
      const { criados, atualizados, trocados } = await importarInsumos(
        prisma,
        relatorio.importaveis,
      );

      console.log(`insumos       ${criados} novo(s), ${atualizados} atualizado(s)`);

      if (trocados.length > 0) {
        avisos.push(
          `${trocados.length} código(s) passaram a apontar para outro produto, ` +
            `levando junto o que estava pendurado neles:\n  ${trocados.join('\n  ')}\n` +
            'Confira essas restrições e faixas: elas foram escritas para a substância anterior.',
        );
      }

      // Alto, e não como nota de rodapé: a diferença entre 702 e 308 é a razão
      // de metade do catálogo não poder ser prescrita, e quem roda isto precisa
      // sair sabendo o número.
      avisos.push(
        `${relatorio.bloqueadas.length} de ${relatorio.total} insumos ficaram de fora por não serem precificáveis.\n` +
          'Rode `catalogo:conferir` no mesmo arquivo para a lista, linha a linha.',
      );
    }

    if (values.controlados) {
      const linhas = controladosSchema.parse(ler(values.controlados));
      const { marcados, semInsumo } = await marcarControlados(prisma, linhas);

      console.log(`controlados   ${marcados} marcado(s)`);
      if (semInsumo.length > 0) {
        // Silêncio aqui seria lido como "está tudo marcado", e um controlado
        // seguiria prescritível sem exigir receita.
        avisos.push(
          `${semInsumo.length} controlado(s) sem insumo correspondente, e portanto NÃO marcados: ` +
            `${semInsumo.join(', ')}.`,
        );
      }
    }

    if (values.excecoes) {
      const linhas = excecoesSchema.parse(ler(values.excecoes));
      const { criadas, jaExistiam, problemas } = await importarExcecoes(prisma, linhas);

      console.log(`restrições    ${criadas} nova(s), ${jaExistiam} já existia(m)`);
      if (problemas.length > 0) {
        avisos.push(`Restrições não aplicadas:\n  ${problemas.join('\n  ')}`);
      }
    }

    if (avisos.length > 0) {
      console.warn(`\n${avisos.join('\n\n')}`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

async function importarFormas(prisma: PrismaService, nomes: string[]): Promise<Contagem> {
  let criados = 0;
  let atualizados = 0;

  for (const bruto of nomes) {
    const nome = bruto.trim().toUpperCase();
    const existente = await prisma.formaFarmaceutica.findUnique({
      where: { nome },
      select: { id: true },
    });

    if (existente) {
      // Sem update: `aceitaAroma` pode ter sido corrigido na tela, e o arquivo
      // não sabe disso — ele só traz nomes.
      atualizados += 1;
      continue;
    }

    await prisma.formaFarmaceutica.create({
      data: { nome, aceitaAroma: COM_AROMA.has(nome) },
    });
    criados += 1;
  }

  return { criados, atualizados };
}

async function importarInsumos(
  prisma: PrismaService,
  insumos: readonly InsumoConvertido[],
): Promise<Contagem & { trocados: string[] }> {
  let criados = 0;
  let atualizados = 0;
  const trocados: string[] = [];

  for (const insumo of insumos) {
    const existente = await prisma.insumo.findUnique({
      where: { codigo: insumo.codigo },
      select: {
        id: true,
        descricao: true,
        _count: { select: { restricoes: true, faixas: true } },
      },
    });

    // Código reaproveitado para outro produto.
    //
    // A receita emitida não corre risco: `ItemDaFormulacao` congela código e
    // descrição na emissão. O que segue a linha do insumo é o que está
    // pendurado nela — restrição de forma e faixa terapêutica. Uma proibição
    // escrita para a pancreatina passaria, calada, a valer para a vitamina que
    // herdou o código; e a faixa de dose de uma substância passaria a conferir
    // a dose de outra, que é o pior dos dois.
    //
    // Avisa e segue: a farmácia corrige descrição no export legitimamente, e
    // recusar a importação inteira por isso pararia o trabalho. Quem lê o aviso
    // decide se apaga o que ficou pendurado.
    if (existente && !mesmaSubstancia(existente.descricao, insumo.descricao)) {
      const pendurado = existente._count.restricoes + existente._count.faixas;
      if (pendurado > 0) {
        trocados.push(
          `${insumo.codigo}: "${existente.descricao}" → "${insumo.descricao}", ` +
            `com ${existente._count.restricoes} restrição(ões) e ${existente._count.faixas} faixa(s) ` +
            'que continuam valendo para o código, agora com outro produto.',
        );
      }
    }

    // `controlado` e `listaDeControle` ficam fora do update de propósito: quem
    // manda neles é `controlados.json` e a tela, não o export de preço. Um
    // reimport não deve desmarcar um controlado.
    //
    // `estoqueEmMiligramas` também: a conferência o deixa nulo porque o export
    // traz número sem unidade, e sobrescrever com nulo apagaria uma contagem
    // feita à mão.
    const campos = {
      descricao: insumo.descricao,
      custoPorGramaEmMicro: insumo.custoPorGramaEmMicro,
      custoDeReferenciaPorGramaEmMicro: insumo.custoDeReferenciaPorGramaEmMicro,
      markupEmCentesimos: insumo.markupEmCentesimos,
    };

    if (existente) {
      await prisma.insumo.update({ where: { id: existente.id }, data: campos });
      atualizados += 1;
    } else {
      await prisma.insumo.create({
        data: { codigo: insumo.codigo, ...campos, estoqueEmMiligramas: null },
      });
      criados += 1;
    }
  }

  return { criados, atualizados, trocados };
}

async function marcarControlados(
  prisma: PrismaService,
  linhas: readonly { codigo: number; nome: string; lista: string }[],
): Promise<{ marcados: number; semInsumo: string[] }> {
  let marcados = 0;
  const semInsumo: string[] = [];

  for (const linha of linhas) {
    const codigo = String(linha.codigo);
    const existente = await prisma.insumo.findUnique({ where: { codigo }, select: { id: true } });

    if (!existente) {
      semInsumo.push(`${codigo} ${linha.nome}`);
      continue;
    }

    await prisma.insumo.update({
      where: { id: existente.id },
      data: { controlado: true, listaDeControle: linha.lista.trim().toUpperCase() },
    });
    marcados += 1;
  }

  return { marcados, semInsumo };
}

async function importarExcecoes(
  prisma: PrismaService,
  linhas: readonly { codigo: number; produto: string; regra: string }[],
): Promise<{ criadas: number; jaExistiam: number; problemas: string[] }> {
  let criadas = 0;
  let jaExistiam = 0;
  const problemas: string[] = [];

  for (const linha of linhas) {
    const regra = linha.regra.trim().toUpperCase();
    const nomeDaForma = FORMA_DA_REGRA[regra];

    if (!nomeDaForma) {
      problemas.push(`${linha.produto}: regra "${linha.regra}" não está no mapa de formas.`);
      continue;
    }

    const codigo = String(linha.codigo);
    const insumo = await prisma.insumo.findUnique({ where: { codigo }, select: { id: true } });
    if (!insumo) {
      problemas.push(`${linha.produto}: insumo ${codigo} não está no catálogo.`);
      continue;
    }

    const forma = await prisma.formaFarmaceutica.findUnique({
      where: { nome: nomeDaForma },
      select: { id: true },
    });
    if (!forma) {
      problemas.push(`${linha.produto}: forma "${nomeDaForma}" não está cadastrada.`);
      continue;
    }

    const existente = await prisma.restricaoDeForma.findUnique({
      where: { insumoId_formaId: { insumoId: insumo.id, formaId: forma.id } },
      select: { id: true },
    });

    if (existente) {
      jaExistiam += 1;
      continue;
    }

    await prisma.restricaoDeForma.create({
      data: { insumoId: insumo.id, formaId: forma.id, motivo: linha.regra.trim() },
    });
    criadas += 1;
  }

  return { criadas, jaExistiam, problemas };
}

principal().catch((erro: unknown) => {
  process.stderr.write(`\n${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
});
