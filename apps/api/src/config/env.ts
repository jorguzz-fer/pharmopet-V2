import { z } from 'zod';

/**
 * Configuração 12-factor: tudo por variável de ambiente, validado no boot.
 *
 * O processo recusa subir com configuração inválida em vez de falhar mais
 * tarde, em runtime, num caminho qualquer. Nada de valor secreto embutido
 * como padrão — ausência de segredo é erro, não conveniência.
 */
export const envSchema = z
  .object({
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

    /**
     * Quanto tempo uma sessão vale sem renovação. Doze horas cobre um plantão
     * inteiro sem pedir senha no meio de um atendimento, e ainda assim expira
     * antes do dia seguinte.
     */
    SESSAO_DURACAO_HORAS: z.coerce
      .number()
      .int()
      .positive()
      .max(24 * 30)
      .default(12),

    /**
     * Marca o cookie de sessão como Secure, o que faz o navegador só enviá-lo por
     * HTTPS. Padrão ligado: desligar é uma decisão consciente de desenvolvimento
     * local, e a validação abaixo impede que ela escape para produção.
     */
    COOKIE_SEGURO: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.COOKIE_SEGURO, {
    message:
      'COOKIE_SEGURO=false em produção entregaria o cookie de sessão em texto claro na primeira requisição HTTP.',
    path: ['COOKIE_SEGURO'],
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.ALLOWED_ORIGINS.length > 0, {
    message: 'Sem ALLOWED_ORIGINS em produção nenhum navegador consegue falar com a API.',
    path: ['ALLOWED_ORIGINS'],
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
