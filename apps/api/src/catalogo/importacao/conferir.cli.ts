import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { conferir, type MotivoDeBloqueio } from './classificacao';

/**
 * Confere um export de catálogo sem tocar no banco.
 *
 *   pnpm --filter @pharmopet/api catalogo:conferir -- --arquivo insumos.json
 *
 * Não importa nada. Só diz, linha a linha, o que o sistema sabe precificar e o
 * que não sabe — para a conversa com a farmácia ser sobre números, e não sobre
 * impressões. Rode de novo a cada export novo.
 */

const EXPLICACAO: Record<MotivoDeBloqueio, string> = {
  'tipo-de-calculo-nao-suportado':
    'dosado por percentual da fórmula ou como QSP; o motor só sabe dose fixa por unidade',
  'unidade-nao-convertivel':
    'manipulado em ml, UI, UFC ou unidade; sem densidade ou título não vira grama',
  'sem-regra-de-preco': 'markup zerado ou negativo; multiplicar por isso não dá preço',
  'custo-implausivel': 'custo por grama zerado ou fora de qualquer escala plausível',
  'linha-invalida': 'faltam campos ou vieram com o tipo errado',
};

function principal(): void {
  const { values } = parseArgs({ options: { arquivo: { type: 'string' } } });

  if (!values.arquivo) {
    throw new Error('Informe o arquivo: --arquivo caminho/para/insumos.json');
  }

  const bruto: unknown = JSON.parse(readFileSync(values.arquivo, 'utf8'));
  if (!Array.isArray(bruto)) {
    throw new Error('O arquivo precisa conter uma lista de insumos.');
  }

  const relatorio = conferir(bruto);
  const proporcao =
    relatorio.total === 0 ? 0 : (relatorio.importaveis.length / relatorio.total) * 100;

  const linhas: string[] = [
    '',
    `Catálogo conferido: ${relatorio.total} linhas`,
    '',
    `  entram no sistema  ${relatorio.importaveis.length} (${proporcao.toFixed(0)}%)`,
    `  ficam de fora      ${relatorio.bloqueadas.length}`,
    '',
    'Por que ficam de fora (uma linha pode ter mais de um motivo):',
    '',
  ];

  const motivos = Object.entries(relatorio.porMotivo)
    .filter(([, quantas]) => quantas > 0)
    .sort(([, a], [, b]) => b - a);

  for (const [motivo, quantas] of motivos) {
    linhas.push(`  ${String(quantas).padStart(4)}  ${motivo}`);
    linhas.push(`        ${EXPLICACAO[motivo as MotivoDeBloqueio]}`);
  }

  // Uma amostra por motivo, para a conversa com a farmácia ter nome e código.
  linhas.push('', 'Exemplos:', '');
  for (const [motivo] of motivos) {
    const exemplos = relatorio.bloqueadas
      .filter((b) => b.motivos.includes(motivo as MotivoDeBloqueio))
      .slice(0, 3);

    linhas.push(`  ${motivo}`);
    for (const e of exemplos) linhas.push(`      ${e.codigo.padStart(5)}  ${e.descricao}`);
    linhas.push('');
  }

  process.stdout.write(`${linhas.join('\n')}\n`);
}

try {
  principal();
} catch (erro) {
  process.stderr.write(`\n${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
}
