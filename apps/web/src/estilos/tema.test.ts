import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cor, estado } from '@pharmopet/design-tokens';
import { describe, expect, it } from 'vitest';

/**
 * A ponte entre o pacote de tokens e o Tailwind é um gerador, e gerador quebra
 * calado: bastaria o script deixar de emitir uma escala para os utilitários
 * dela sumirem e a tela cair no cinza padrão do framework sem nenhum erro.
 *
 * Este teste amarra as duas pontas — se um token existe, o tema o expõe.
 */
const tema = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'tema.gerado.css'),
  'utf8',
);

describe('tema gerado', () => {
  it('expõe toda cor de marca como variável do Tailwind', () => {
    for (const [escala, valores] of Object.entries(cor)) {
      const nome = escala.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      for (const [passo, hex] of Object.entries(valores)) {
        expect(tema, `faltou --color-${nome}-${passo}`).toContain(
          `--color-${nome}-${passo}: ${hex};`,
        );
      }
    }
  });

  it('expõe toda cor de estado', () => {
    for (const [nome, papeis] of Object.entries(estado)) {
      for (const [papel, hex] of Object.entries(papeis)) {
        expect(tema, `faltou --color-${nome}-${papel}`).toContain(
          `--color-${nome}-${papel}: ${hex};`,
        );
      }
    }
  });

  it('sai dentro de @theme, senão o Tailwind não cria utilitário nenhum', () => {
    expect(tema).toMatch(/@theme\s*\{/);
  });
});
