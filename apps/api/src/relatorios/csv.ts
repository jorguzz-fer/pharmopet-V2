/**
 * CSV para abrir no Excel em português.
 *
 * Três decisões que parecem detalhe e não são:
 *
 * 1. **Separador `;`**, e não vírgula. O Excel em pt-BR usa a vírgula como
 *    separador decimal, então um arquivo com vírgula abre com tudo numa
 *    coluna só. A farmácia vive de planilha (ver `dados/README.md`); entregar
 *    um CSV que ela precisa reimportar à mão é entregar meio arquivo.
 * 2. **BOM no começo.** Sem ele o Excel lê o arquivo como latin-1 e "Clínica
 *    Vida Animal" vira "ClÃ­nica". É o defeito que faz alguém desistir do
 *    botão de exportar e pedir os números por e-mail.
 * 3. **Valor em número, com vírgula decimal e sem "R$".** Com o cifrão o
 *    Excel trata a célula como texto e a soma não funciona — que é a primeira
 *    coisa que alguém faz com uma coluna de dinheiro.
 */

/** O que o Excel em pt-BR espera encontrar. */
const SEPARADOR = ';';
const BOM = '﻿';

/**
 * Escapa um campo.
 *
 * Aspas duplas quando há separador, aspas ou quebra de linha — e aspas de
 * dentro viram duas. Nome de tutor com ponto e vírgula é raro; observação com
 * quebra de linha, não. Sem isto, uma linha vira duas e o arquivo inteiro
 * desalinha a partir dali.
 */
function campo(valor: string): string {
  return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/** Reais com vírgula decimal, do jeito que a planilha soma. */
export function reaisParaPlanilha(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

/**
 * Monta o CSV.
 *
 * `\r\n` porque é o que o CSV do Excel usa; com `\n` sozinho algumas versões
 * antigas juntam tudo numa linha.
 */
export function montarCsv(cabecalho: string[], linhas: string[][]): string {
  const tudo = [cabecalho, ...linhas].map((linha) => linha.map(campo).join(SEPARADOR)).join('\r\n');

  return `${BOM}${tudo}\r\n`;
}
