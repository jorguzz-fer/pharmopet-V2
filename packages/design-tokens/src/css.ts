import { cor, estado, fonte, tamanhoFonte, espaco, raio, alturaControle } from './tokens';

/**
 * Emite os tokens como custom properties CSS.
 *
 * Assim o mesmo conjunto serve tanto a componentes tipados quanto a folhas de
 * estilo, sem um segundo lugar para a paleta divergir.
 */
export function cssDosTokens(): string {
  const linhas: string[] = [];

  for (const [escala, valores] of Object.entries(cor)) {
    for (const [passo, hex] of Object.entries(valores)) {
      linhas.push(`  --cor-${escala}-${passo}: ${hex};`);
    }
  }

  for (const [nome, papeis] of Object.entries(estado)) {
    for (const [papel, hex] of Object.entries(papeis)) {
      linhas.push(`  --estado-${nome}-${papel}: ${hex};`);
    }
  }

  for (const [nome, valor] of Object.entries(fonte)) {
    linhas.push(`  --fonte-${nome}: ${valor};`);
  }
  for (const [nome, valor] of Object.entries(tamanhoFonte)) {
    linhas.push(`  --texto-${nome}: ${valor};`);
  }
  for (const [nome, valor] of Object.entries(espaco)) {
    linhas.push(`  --espaco-${nome}: ${valor};`);
  }
  for (const [nome, valor] of Object.entries(raio)) {
    linhas.push(`  --raio-${nome}: ${valor};`);
  }
  linhas.push(`  --altura-controle: ${alturaControle};`);

  return `:root {\n${linhas.join('\n')}\n}\n`;
}
