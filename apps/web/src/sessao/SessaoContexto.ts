import { createContext, useContext } from 'react';
import type { components } from '@pharmopet/api-client';

export type Usuario = components['schemas']['EuDto'];

export type EstadoDaSessao =
  /** Ainda perguntando à API. Nem logado nem deslogado — e a diferença importa. */
  { situacao: 'verificando' } | { situacao: 'dentro'; usuario: Usuario } | { situacao: 'fora' };

export type Sessao = {
  estado: EstadoDaSessao;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
};

export const SessaoContexto = createContext<Sessao | null>(null);

export function useSessao(): Sessao {
  const valor = useContext(SessaoContexto);

  if (!valor) {
    // Erro de programação, não de uso: falhar alto é melhor do que devolver um
    // estado "fora" falso e mandar alguém para o login sem motivo.
    throw new Error('useSessao precisa estar dentro de <ProvedorDeSessao>.');
  }

  return valor;
}
