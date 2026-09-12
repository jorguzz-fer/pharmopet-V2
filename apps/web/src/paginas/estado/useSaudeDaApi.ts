import { useCallback, useEffect, useState } from 'react';
import { ErroDeApi, exigir } from '@pharmopet/api-client';
import type { Saude } from '@pharmopet/api-client';
import { api } from '@/api/cliente';

export type EstadoDaConsulta =
  | { situacao: 'carregando' }
  | { situacao: 'ok'; saude: Saude }
  | { situacao: 'falha'; motivo: string };

function descreverFalha(erro: unknown): string {
  if (erro instanceof ErroDeApi) return `A API respondeu ${erro.status}.`;
  // Sem resposta nenhuma: API fora do ar, DNS errado, ou origem barrada no CORS.
  // O navegador não distingue os três por segurança, então não vale chutar qual é.
  return 'Não foi possível falar com a API.';
}

/**
 * Consulta o liveness da API.
 *
 * Os três estados são explícitos de propósito: a tela precisa saber distinguir
 * "ainda não sei" de "está fora", senão o carregamento vira um falso negativo.
 */
export function useSaudeDaApi(): { estado: EstadoDaConsulta; reconsultar: () => void } {
  const [estado, setEstado] = useState<EstadoDaConsulta>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  const reconsultar = useCallback(() => {
    setEstado({ situacao: 'carregando' });
    setTentativa((n) => n + 1);
  }, []);

  useEffect(() => {
    // A tela pode ser desmontada antes da resposta chegar; sem isto o React
    // recebe um setState de componente morto a cada navegação apressada.
    let vivo = true;

    exigir(api.GET('/api/v1/health'))
      .then((saude) => {
        if (vivo) setEstado({ situacao: 'ok', saude });
      })
      .catch((erro: unknown) => {
        if (vivo) setEstado({ situacao: 'falha', motivo: descreverFalha(erro) });
      });

    return () => {
      vivo = false;
    };
  }, [tentativa]);

  return { estado, reconsultar };
}
