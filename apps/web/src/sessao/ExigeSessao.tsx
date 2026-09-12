import { Navigate, Outlet, useLocation } from 'react-router';
import { useSessao } from './SessaoContexto';

/**
 * Porta das rotas internas.
 *
 * Isto é conveniência, não segurança: quem apagar este componente no inspetor
 * vê a moldura vazia e nada mais, porque cada chamada continua sendo recusada
 * pela API. O controle de acesso de verdade é server-side, como a ADR 0008 e o
 * blueprint exigem — aqui só se evita mostrar uma tela que não vai funcionar.
 */
export function ExigeSessao() {
  const { estado } = useSessao();
  const local = useLocation();

  if (estado.situacao === 'verificando') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-neutro-500" role="status">
          Verificando sua sessão…
        </p>
      </div>
    );
  }

  if (estado.situacao === 'fora') {
    // Guarda de onde a pessoa veio para devolvê-la ao mesmo lugar depois de
    // entrar. Sem isso, um link recebido pelo WhatsApp sempre cairia no início.
    return <Navigate to="/entrar" replace state={{ de: local.pathname + local.search }} />;
  }

  return <Outlet />;
}
