/**
 * Cliente da API da PharmoPet.
 *
 * Regra do pacote: nada aqui é escrito à mão a partir de conhecimento do
 * servidor. Os tipos vêm do contrato gerado; o que se escreve é só o
 * encanamento (sessão, erro, desembrulho).
 */

export * from './cliente.js';
export type { paths, components, operations } from './gerado/api.js';

/** Tipos de domínio prontos para uso, sem obrigar o chamador a indexar `components`. */
export type { Saude } from './tipos.js';
