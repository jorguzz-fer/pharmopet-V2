import { useCallback, useEffect, useState } from 'react';
import { ErroDeApi } from '@pharmopet/api-client';

/**
 * Carregamento de dados, com os três estados separados.
 *
 * "Ainda não sei" não é a mesma coisa que "não tem nada": a tela que trata os
 * dois igual mostra "nenhum tutor encontrado" enquanto a resposta está a
 * caminho, e quem lê isso desiste da busca certa.
 */
export type Consulta<T> =
  { situacao: 'carregando' } | { situacao: 'ok'; dado: T } | { situacao: 'falha'; motivo: string };

/**
 * Frase para a pessoa, a partir do status.
 *
 * O status cru não ajuda ninguém no balcão. E 404 aqui quase nunca é "não
 * existe" — é "não é seu" (ADR 0011), então a frase não deve afirmar que o
 * registro não existe.
 */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroDeApi) {
    switch (erro.status) {
      case 400:
        return extrairMensagem(erro.corpo) ?? 'Confira os dados enviados.';
      case 401:
        return 'Sua sessão expirou. Entre de novo.';
      case 403:
        return 'Seu perfil não tem acesso a esta ação.';
      case 404:
        return 'Não encontrado.';
      case 409:
        return extrairMensagem(erro.corpo) ?? 'Já existe um registro com estes dados.';
      case 429:
        return 'Muitas requisições. Espere um instante.';
      default:
        return `O sistema respondeu ${erro.status}.`;
    }
  }

  // Sem resposta nenhuma: API fora, DNS errado ou origem barrada no CORS. O
  // navegador não distingue os três, então não vale chutar qual foi.
  return 'Não foi possível falar com o sistema. Verifique a conexão.';
}

/** A mensagem que a API mandou, quando mandou uma. */
function extrairMensagem(corpo: unknown): string | null {
  if (typeof corpo !== 'object' || corpo === null) return null;
  const m = (corpo as { message?: unknown }).message;

  if (typeof m === 'string') return m;
  // O ZodValidationPipe devolve uma lista quando há mais de um campo errado.
  if (Array.isArray(m) && typeof m[0] === 'string') return m[0];

  return null;
}

/**
 * Roda a busca e devolve o estado, com uma função para repetir.
 *
 * `chave` decide quando refazer: mude a chave e a consulta roda de novo. É o
 * mesmo contrato de um array de dependências, com um nome que diz o que faz.
 */
export function useConsulta<T>(
  chave: string,
  buscar: () => Promise<T>,
): { estado: Consulta<T>; recarregar: () => void } {
  const [estado, setEstado] = useState<Consulta<T>>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => {
    setEstado({ situacao: 'carregando' });
    setTentativa((n) => n + 1);
  }, []);

  useEffect(() => {
    // A tela pode sair antes da resposta chegar. Sem isto, o React recebe um
    // setState de componente morto a cada navegação apressada — e, pior, uma
    // resposta atrasada de uma busca antiga sobrescreveria a nova.
    let vivo = true;

    setEstado({ situacao: 'carregando' });

    buscar()
      .then((dado) => {
        if (vivo) setEstado({ situacao: 'ok', dado });
      })
      .catch((erro: unknown) => {
        if (vivo) setEstado({ situacao: 'falha', motivo: mensagemDeErro(erro) });
      });

    return () => {
      vivo = false;
    };
    // Só `chave` e `tentativa`, de propósito. `buscar` muda de identidade a
    // cada render, e incluí-la aqui faria a consulta rodar em laço infinito —
    // é a chave que diz quando a busca de fato mudou.
  }, [chave, tentativa]);

  return { estado, recarregar };
}

/**
 * Espera a digitação parar antes de deixar o valor passar.
 *
 * A cotação roda a cada tecla do campo de dose. Sem isto, digitar "250" dispara
 * três orçamentos, e o da primeira tecla pode chegar por último e sobrescrever
 * o certo.
 */
export function useAtrasado<T>(valor: T, milissegundos = 350): T {
  const [atrasado, setAtrasado] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), milissegundos);
    return () => clearTimeout(t);
  }, [valor, milissegundos]);

  return atrasado;
}
