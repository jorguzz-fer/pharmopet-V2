import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  alturaControle,
  cor,
  espaco,
  estado,
  fonte,
  raio,
  tamanhoFonte,
} from '@pharmopet/design-tokens';

/**
 * Traduz os tokens de design para o `@theme` do Tailwind.
 *
 * O adaptador mora aqui, no app, e não no pacote de tokens: o pacote é
 * compartilhado com o que vier depois (nativo, e-mail, PDF) e não deve saber
 * qual framework de CSS a web escolheu. Quem conhece o Tailwind é o app.
 *
 * O efeito prático é que `bg-turquesa-700` e `text-neutro-500` passam a
 * existir como utilitário — e a única forma de mudar a cor é mudar o token.
 * Hex solto em componente deixa de ter para onde ir.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = resolve(RAIZ, 'src/estilos/tema.gerado.css');

/** `sobreEscuro` vira `sobre-escuro`: nome de utilitário do Tailwind é kebab. */
const kebab = (nome) => nome.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const linhas = [];

for (const [escala, valores] of Object.entries(cor)) {
  for (const [passo, hex] of Object.entries(valores)) {
    linhas.push(`  --color-${kebab(escala)}-${passo}: ${hex};`);
  }
}

for (const [nome, papeis] of Object.entries(estado)) {
  for (const [papel, hex] of Object.entries(papeis)) {
    linhas.push(`  --color-${kebab(nome)}-${kebab(papel)}: ${hex};`);
  }
}

for (const [nome, valor] of Object.entries(fonte)) {
  linhas.push(`  --font-${nome}: ${valor};`);
}
for (const [nome, valor] of Object.entries(tamanhoFonte)) {
  linhas.push(`  --text-${nome}: ${valor};`);
}
for (const [nome, valor] of Object.entries(espaco)) {
  linhas.push(`  --spacing-${nome}: ${valor};`);
}
for (const [nome, valor] of Object.entries(raio)) {
  linhas.push(`  --radius-${nome}: ${valor};`);
}
linhas.push(`  --altura-controle: ${alturaControle};`);

const conteudo = `/* Gerado por scripts/gerar-tema.mjs a partir de @pharmopet/design-tokens.
   Não edite à mão: a próxima geração apaga. Mude o token. */

@theme {
${linhas.join('\n')}
}
`;

mkdirSync(dirname(DESTINO), { recursive: true });
writeFileSync(DESTINO, conteudo);
process.stdout.write(`tema escrito em ${DESTINO} (${linhas.length} tokens)\n`);
