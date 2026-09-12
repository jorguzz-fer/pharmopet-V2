import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cor, estado } from '@pharmopet/design-tokens';
import { describe, expect, it } from 'vitest';

/**
 * A ponte entre o pacote de tokens e o Tailwind é um gerador, e gerador quebra
 * calado: bastaria o script deixar de emitir uma escala para os utilitários
 * dela sumirem e a tela cair na cor herdada, sem nenhum erro.
 *
 * Este teste amarra as duas pontas — se um token existe, o tema o expõe, com um
 * nome que o Tailwind aceita.
 */
const tema = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'tema.gerado.css'),
  'utf8',
);

/** Mesma transformação do gerador: `marcaSecundaria` → `marca-secundaria`. */
const kebab = (nome: string) => nome.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

describe('tema gerado', () => {
  it('expõe toda cor de marca como variável do Tailwind', () => {
    for (const [escala, valores] of Object.entries(cor)) {
      for (const [passo, hex] of Object.entries(valores)) {
        const variavel = `--color-${kebab(escala)}-${kebab(passo)}`;
        expect(tema, `faltou ${variavel}`).toContain(`${variavel}: ${hex};`);
      }
    }
  });

  it('expõe toda cor de estado', () => {
    for (const [nome, papeis] of Object.entries(estado)) {
      for (const [papel, hex] of Object.entries(papeis)) {
        const variavel = `--color-${kebab(nome)}-${kebab(papel)}`;
        expect(tema, `faltou ${variavel}`).toContain(`${variavel}: ${hex};`);
      }
    }
  });

  it('sai dentro de @theme, senão o Tailwind não cria utilitário nenhum', () => {
    expect(tema).toMatch(/@theme\b/);
  });

  /**
   * Sem `static`, o Tailwind descarta do CSS final toda variável que nenhuma
   * classe utilitária usou. Quem lê o token por `var()` — um SVG que pinta o
   * traço conforme o fundo — ficava com a variável inexistente e caía na cor
   * herdada. Foi metade do que apagou o "PET" da marca no painel escuro do
   * login, com a suíte inteira verde.
   */
  it('emite o tema como static, senão a variável não usada em utilitário some', () => {
    expect(tema).toMatch(/@theme\s+static\s*\{/);
  });

  /**
   * A outra metade: o gerador deixava o passo em camelCase e saía
   * `--color-sobre-escuro-marcaSecundaria`. O Tailwind descarta o nome com
   * maiúscula sem reclamar, e a cor simplesmente não existia.
   */
  it('não emite variável com maiúscula, que o Tailwind descarta calado', () => {
    const comMaiuscula = [...tema.matchAll(/^\s*(--[\w-]*[A-Z][\w-]*)\s*:/gm)].map((m) => m[1]);

    expect(comMaiuscula).toEqual([]);
  });
});
