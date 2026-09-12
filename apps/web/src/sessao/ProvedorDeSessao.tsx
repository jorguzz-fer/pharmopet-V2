import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ErroDeApi, exigir } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { SessaoContexto, type EstadoDaSessao, type Sessao } from './SessaoContexto';

/**
 * Quem está logado, para a aplicação inteira.
 *
 * A verdade mora no cookie httpOnly, que o JavaScript não lê. Então a única
 * forma de saber se há sessão é perguntar à API — e é o que isto faz ao montar.
 * A consequência é que existe um terceiro estado, "verificando", que precisa ser
 * tratado: tratá-lo como "fora" jogaria a pessoa no login a cada F5, mesmo
 * logada.
 */
export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDaSessao>({ situacao: 'verificando' });

  const consultar = useCallback(async () => {
    try {
      const usuario = await exigir(api.GET('/api/v1/auth/eu'));
      setEstado({ situacao: 'dentro', usuario });
    } catch (erro) {
      // 401 aqui é a resposta normal de quem não entrou, não uma falha. Só vale
      // a pena diferenciar de erro de rede em log, não na tela.
      if (!(erro instanceof ErroDeApi) || erro.status !== 401) {
        console.warn('não consegui verificar a sessão', erro);
      }
      setEstado({ situacao: 'fora' });
    }
  }, []);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  const entrar = useCallback(
    async (email: string, senha: string) => {
      await exigirSemConteudo(api.POST('/api/v1/auth/entrar', { body: { email, senha } }));
      // Relê em vez de confiar no que foi digitado: quem diz o papel e o nome
      // é o servidor, e é o papel que decide o que a tela mostra.
      await consultar();
    },
    [consultar],
  );

  /**
   * Nunca rejeita, de propósito.
   *
   * Sair é uma saída, não uma operação que pode ser negada: se a chamada falha
   * — cookie já expirado, rede caída — manter a pessoa presa numa sessão morta
   * seria pior. E como a tela chama isto de um `onClick`, uma rejeição aqui
   * viraria um erro sem quem o pegasse.
   */
  const sair = useCallback(async () => {
    try {
      await exigirSemConteudo(api.POST('/api/v1/auth/sair'));
    } catch (erro) {
      // Não passa em silêncio: se a saída está falhando sempre, é sinal de
      // algo quebrado no servidor, e alguém precisa ver isso no console.
      console.warn('a chamada de saída falhou; encerrando a sessão localmente', erro);
    } finally {
      setEstado({ situacao: 'fora' });
    }
  }, []);

  const valor = useMemo<Sessao>(() => ({ estado, entrar, sair }), [estado, entrar, sair]);

  return <SessaoContexto.Provider value={valor}>{children}</SessaoContexto.Provider>;
}

/**
 * Variante de `exigir` para respostas 204.
 *
 * `exigir` espera um corpo e, sem ele, trataria um sucesso como falha. Aqui o
 * que interessa é só o erro — e o openapi-fetch já devolve `error` preenchido
 * quando o status não é de sucesso.
 */
async function exigirSemConteudo(
  chamada: Promise<{ error?: unknown; response: Response }>,
): Promise<void> {
  const { error, response } = await chamada;
  if (!response.ok) throw new ErroDeApi(response.status, error);
}
