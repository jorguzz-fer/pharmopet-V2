import { z } from 'zod';

/**
 * Configuração do front, validada no carregamento.
 *
 * Mesma ideia do env da API: errar a URL da API e só descobrir na primeira
 * chamada é pior do que a tela recusar subir dizendo o que falta. Aqui não
 * entra segredo — o que o navegador recebe é público por definição.
 */
const ambienteSchema = z.object({
  /** Raiz da API, sem barra no fim. */
  VITE_API_URL: z
    .url({ message: 'VITE_API_URL precisa ser uma URL absoluta, ex.: http://localhost:3000' })
    .transform((v) => v.replace(/\/+$/, '')),
});

export type Ambiente = z.infer<typeof ambienteSchema>;

export function lerAmbiente(bruto: Record<string, unknown>): Ambiente {
  const resultado = ambienteSchema.safeParse(bruto);

  if (!resultado.success) {
    const detalhes = resultado.error.issues
      .map((i) => `  • ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração do front inválida:\n${detalhes}`);
  }

  return resultado.data;
}

export const ambiente = lerAmbiente(import.meta.env);
