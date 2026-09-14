import type { ReactNode } from 'react';
import { Marca } from '@/componentes/Marca';

/**
 * A moldura das duas telas de senha.
 *
 * Mesma marca e mesmo enquadramento da entrada: quem cai aqui vindo de um link
 * de e-mail precisa reconhecer o sistema antes de digitar uma senha. Página
 * anônima que não parece com o login é como um phishing se parece.
 */
export function Moldura({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Marca />
        <h1 className="mt-8 font-titulo text-2xl font-extrabold tracking-tight">{titulo}</h1>
        {children}
      </div>
    </div>
  );
}
