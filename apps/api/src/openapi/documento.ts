import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Monta o documento OpenAPI da API.
 *
 * Mora aqui, e não no boot, porque tem dois consumidores: o servidor, que o
 * publica em /api/docs, e o gerador do pacote api-client. Se cada um montasse
 * o seu, o contrato servido e o contrato gerado poderiam divergir sem ninguém
 * notar — que é exatamente o drift que a geração existe para evitar.
 */
export function criarDocumentoOpenApi(app: INestApplication): OpenAPIObject {
  const cru = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('PharmoPet API')
      .setDescription('Prescrição e manipulação veterinária')
      .setVersion('1.0.0')
      .setOpenAPIVersion('3.1.0')
      .build(),
  );

  return cleanupOpenApiDoc(corrigirAnulaveis(cru));
}

/** A marca que o nestjs-zod deixa no que não conseguiu tipar. */
const MARCA = 'x-nestjs_zod-empty-type';

/**
 * Conserta campo anulável que sai do gerador como lista de textos.
 *
 * O Zod 4 emite `z.string().nullable()` na forma compacta do JSON Schema:
 * `{"type": ["string", "null"]}`. É válido em OpenAPI 3.1, mas a fábrica de
 * schemas do Nest lê esse `type` como lista de itens e conclui que o campo é
 * um array — então `cpf: string | null` chega ao cliente gerado como
 * `cpf: string[]`.
 *
 * Anulável de enum e de inteiro escapa, porque o Zod os emite como `anyOf`,
 * que o Nest entende. Só o texto simples cai nesta armadilha.
 *
 * O `cleanupOpenApiDoc` apaga a marca sem corrigir a forma, então a correção
 * precisa vir antes dele — enquanto ainda dá para saber quais campos foram
 * afetados, em vez de tentar adivinhar olhando o resultado.
 *
 * O contrato mentia sobre 26 campos desde a fase 2, `EuDto.crmv` entre eles.
 * Ninguém viu porque nenhum consumidor lia esses campos; apareceu no dia em
 * que a tela do receituário foi ler o CPF do tutor e recebeu `string[]`.
 */
function corrigirAnulaveis(documento: OpenAPIObject): OpenAPIObject {
  visitar(documento, (no) => {
    if (no[MARCA] !== true) return;

    // A marca aparece tanto no que saiu deformado quanto no que saiu certo —
    // o nestjs-zod a usa para dizer "não determinei por reflexão", e não "está
    // errado". Quem já tem `anyOf` está correto e fica como está.
    if (Array.isArray(no.anyOf)) return;

    // A única deformação conhecida é `{type:'array', items:{type:'string'}}`.
    // Marca em qualquer outra forma é caso novo: falhar alto aqui é melhor do
    // que chutar o tipo e publicar um contrato errado em silêncio — que foi
    // exatamente como este bug sobreviveu a três fases.
    const items = no.items as { type?: unknown } | undefined;
    if (no.type !== 'array' || items?.type !== 'string') {
      throw new Error(
        `Campo de tipo indeterminado numa forma inesperada: ${JSON.stringify(no)}. ` +
          'Veja corrigirAnulaveis() em src/openapi/documento.ts antes de gerar o contrato.',
      );
    }

    delete no.items;
    delete no.type;
    no.anyOf = [{ type: 'string' }, { type: 'null' }];
  });

  return documento;
}

/** Percorre todo objeto do documento, em profundidade. */
function visitar(valor: unknown, aplicar: (no: Record<string, unknown>) => void): void {
  if (Array.isArray(valor)) {
    for (const item of valor) visitar(item, aplicar);
    return;
  }

  if (typeof valor !== 'object' || valor === null) return;

  const no = valor as Record<string, unknown>;
  aplicar(no);

  for (const filho of Object.values(no)) visitar(filho, aplicar);
}
