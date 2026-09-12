import type { components } from './gerado/api.js';

/**
 * Apelidos para os schemas do contrato.
 *
 * São só nomes: o tipo continua sendo o gerado, então se o contrato mudar o
 * apelido muda junto. O ganho é a tela não precisar escrever
 * `components['schemas'][...]` para dizer "uma resposta de saúde".
 */
export type Saude = components['schemas']['SaudeDto'];
