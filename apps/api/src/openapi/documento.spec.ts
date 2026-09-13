import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guarda do contrato contra campos anuláveis mal tipados.
 *
 * Lê o `openapi.json` versionado — o mesmo que o CI regera e compara, e o
 * mesmo de que sai o cliente. Testar o arquivo, e não a função, é o ponto:
 * o que quebra o front é o que está publicado, não o que a função devolveria.
 *
 * O bug que este teste fecha: `z.string().nullable()` saía como
 * `{"type":"array","items":{"type":"string"}}`, e `cpf: string | null` chegava
 * ao cliente gerado como `cpf: string[]`. Passou por três fases sem ninguém
 * notar, porque nenhum consumidor lia esses campos.
 */

type Schema = {
  type?: unknown;
  items?: { type?: unknown };
  anyOf?: { type?: unknown }[];
  properties?: Record<string, Schema>;
};

const documento = JSON.parse(readFileSync(resolve(__dirname, '../../openapi.json'), 'utf8')) as {
  components: { schemas: Record<string, Schema> };
};

const schemas = documento.components.schemas;

/** `true` quando o campo aceita nulo do jeito que o OpenAPI 3.1 espera. */
function aceitaNulo(campo: Schema | undefined): boolean {
  return Boolean(campo?.anyOf?.some((v) => v.type === 'null'));
}

describe('contrato OpenAPI', () => {
  /**
   * Um por DTO em que a deformação apareceu, incluindo os três que já estavam
   * quebrados desde a fase 2.
   */
  it.each([
    ['EuDto', 'crmv'],
    ['TutorDto', 'cpf'],
    ['TutorDto', 'telefone'],
    ['PacienteDto', 'raca'],
    ['ReceitaDto', 'crmv'],
    ['ReceitaDto', 'motivoDoCancelamento'],
    ['InsumoAdminDto', 'listaDeControle'],
    ['FaixaDto', 'observacao'],
  ])('%s.%s é texto anulável, e não lista de textos', (dto, campo) => {
    const propriedade = schemas[dto]?.properties?.[campo];

    expect(propriedade).toBeDefined();
    expect(aceitaNulo(propriedade)).toBe(true);
  });

  /**
   * A varredura geral. Hoje nenhum DTO tem, de verdade, um campo `string[]`;
   * se algum passar a ter, este teste falha e obriga a decidir explicitamente
   * — que é melhor do que a deformação voltar disfarçada de campo legítimo.
   */
  it('nenhum campo de DTO é lista de textos', () => {
    const suspeitos: string[] = [];

    for (const [nome, schema] of Object.entries(schemas)) {
      for (const [campo, valor] of Object.entries(schema.properties ?? {})) {
        if (valor.type === 'array' && valor.items?.type === 'string') {
          suspeitos.push(`${nome}.${campo}`);
        }
      }
    }

    expect(suspeitos).toEqual([]);
  });
});
