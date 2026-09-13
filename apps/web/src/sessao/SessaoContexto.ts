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

/** O papel de quem está dentro, ou `null` enquanto não se sabe. */
export function usePapel(): Usuario['papel'] | null {
  const { estado } = useSessao();

  return estado.situacao === 'dentro' ? estado.usuario.papel : null;
}

/**
 * Quem abre ficha de tutor e de paciente.
 *
 * Serve para a tela não oferecer um botão que a API vai recusar: a farmácia
 * lê a clientela, mas não a cadastra. Continua sendo conveniência — os guards
 * de `@Papeis` é que decidem, e quem chamar a rota direto leva 403.
 */
export function usePodeCadastrarFicha(): boolean {
  const papel = usePapel();

  return papel === 'ADMIN' || papel === 'VETERINARIO';
}

/**
 * Quem prescreve.
 *
 * Mais estreito do que `usePodeCadastrarFicha`, de propósito: o administrador
 * abre ficha de tutor, mas quem assina a receita é quem tem CRMV, e
 * `POST /receituario/receitas` só aceita `VETERINARIO`. A regra mora aqui
 * porque agora três telas a consultam — espalhada, uma delas acabaria
 * oferecendo um botão que a API recusa.
 */
export function usePodePrescrever(): boolean {
  return usePapel() === 'VETERINARIO';
}
