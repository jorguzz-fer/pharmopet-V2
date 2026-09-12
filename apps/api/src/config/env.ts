import { z } from 'zod';

/**
 * Configuração 12-factor: tudo por variável de ambiente, validado no boot.
 *
 * O processo recusa subir com configuração inválida em vez de falhar mais
 * tarde, em runtime, num caminho qualquer. Nada de valor secreto embutido
 * como padrão — ausência de segredo é erro, não conveniência.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),

  /** Origens permitidas para o navegador, separadas por vírgula. */
  ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

export function validarEnv(bruto: NodeJS.ProcessEnv): Env {
  const resultado = envSchema.safeParse(bruto);

  if (!resultado.success) {
    const detalhes = resultado.error.issues
      .map((i) => `  • ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${detalhes}`);
  }

  return resultado.data;
}
