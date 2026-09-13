import { json } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** 512 KB de arquivo cabem em ~683 KB de base64; 1 MB dá folga. */
const LIMITE_COM_ARQUIVO = '1mb';
const LIMITE_PADRAO = '100kb';

/**
 * Tamanho de corpo: pequeno por padrão, maior só onde um arquivo legítimo passa.
 *
 * A escolha é explícita, e não por rota registrada, porque o corpo é lido antes
 * de o roteador existir. Sem o limite maior no caminho do logotipo, o parser
 * padrão responderia 413 e o teto declarado no DTO seria letra morta — o
 * servidor recusaria antes de a validação ter chance de dizer o motivo.
 *
 * Vive aqui, e não solto no `main.ts`, porque o ambiente de teste precisa da
 * mesma montagem: subir a aplicação de teste com outros limites seria testar
 * outra aplicação, e é justamente o teto do logotipo que se quer verificar.
 */
export function limitesDeCorpo(): RequestHandler {
  const comArquivo = json({ limit: LIMITE_COM_ARQUIVO });
  const padrao = json({ limit: LIMITE_PADRAO });

  return (requisicao: Request, resposta: Response, seguir: NextFunction) =>
    (requisicao.path.endsWith('/logotipo') ? comArquivo : padrao)(requisicao, resposta, seguir);
}
