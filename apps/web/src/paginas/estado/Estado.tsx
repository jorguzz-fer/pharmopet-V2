import { Botao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';
import { Selo } from '@/componentes/Selo';
import { ambiente } from '@/config/ambiente';
import { useSaudeDaApi } from './useSaudeDaApi';

function formatarMomento(iso: string): string {
  // Data e hora no formato de quem usa, não no ISO do servidor.
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(iso));
}

/**
 * Estado da instalação.
 *
 * É a primeira tela que alguém abre depois de um deploy: diz, com dado real,
 * se o front está falando com a API que ele acha que deveria. Sem número
 * inventado e sem exemplo — ou responde, ou explica por que não respondeu.
 */
export function Estado() {
  const { estado, reconsultar } = useSaudeDaApi();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Estado da instalação</h1>
        <p className="mt-1 text-sm text-neutro-500">
          Conferência de que esta tela está conversando com a API certa.
        </p>
      </div>

      <Cartao
        titulo="API"
        acessorio={
          estado.situacao === 'ok' ? (
            <Selo tom="sucesso">Respondendo</Selo>
          ) : estado.situacao === 'falha' ? (
            <Selo tom="controlado">Sem resposta</Selo>
          ) : (
            <Selo tom="neutro">Consultando</Selo>
          )
        }
      >
        <dl className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-sm text-neutro-500">Endereço</dt>
            <dd className="font-mono text-sm text-neutro-900">{ambiente.VITE_API_URL}</dd>
          </div>

          {/* aria-live para quem usa leitor de tela receber o desfecho da
              consulta sem precisar reler a página à procura da mudança. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2" aria-live="polite">
            <dt className="text-sm text-neutro-500">Resposta</dt>
            <dd className="text-sm text-neutro-900">
              {estado.situacao === 'carregando' && 'Consultando…'}
              {estado.situacao === 'ok' && (
                <span className="font-mono">{formatarMomento(estado.saude.timestamp)}</span>
              )}
              {estado.situacao === 'falha' && (
                <span className="text-controlado-texto">{estado.motivo}</span>
              )}
            </dd>
          </div>
        </dl>

        {estado.situacao === 'falha' ? (
          <div className="mt-4 flex flex-col gap-3 rounded-controle bg-controlado-fundo p-3">
            <p className="text-xs text-controlado-texto">
              Verifique se a API está no ar e se esta origem está em{' '}
              <code className="font-mono">ALLOWED_ORIGINS</code>. Sem a origem liberada, o navegador
              barra a chamada antes de a API ver qualquer coisa.
            </p>
            <Botao tom="secundario" onClick={reconsultar}>
              Tentar de novo
            </Botao>
          </div>
        ) : null}
      </Cartao>
    </div>
  );
}
