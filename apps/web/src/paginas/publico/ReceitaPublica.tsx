import { useCallback } from 'react';
import { useParams } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { formatarReais, rotuloDoAroma } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { useConsulta } from '@/api/consulta';
import { ambiente } from '@/config/ambiente';
import { Cartao } from '@/componentes/Cartao';
import { Selo, type TomDoSelo } from '@/componentes/Selo';

type ReceitaPublica = components['schemas']['ReceitaPublicaDto'];

const APARENCIA: Record<ReceitaPublica['situacao'], { tom: TomDoSelo; rotulo: string }> = {
  rascunho: { tom: 'neutro', rotulo: 'rascunho' },
  valida: { tom: 'sucesso', rotulo: 'válida' },
  vencida: { tom: 'antimicrobiano', rotulo: 'vencida' },
  cancelada: { tom: 'controlado', rotulo: 'cancelada' },
};

/**
 * A receita como o tutor a vê, pelo link, sem login.
 *
 * Fora do `Layout` de propósito: sem menu, sem abas, sem nada que sugira que há
 * um sistema para entrar. Quem abre isto veio de um link no WhatsApp e quer
 * duas coisas — conferir que é do seu animal e baixar o papel.
 */
export function ReceitaPublica() {
  const { token = '' } = useParams();

  const carregar = useCallback(
    () => exigir(api.GET('/api/v1/publico/receitas/{token}', { params: { path: { token } } })),
    [token],
  );
  const { estado } = useConsulta(`publica:${token}`, carregar);

  if (estado.situacao === 'carregando') return <Moldura>Carregando a receita…</Moldura>;

  if (estado.situacao === 'falha') {
    return (
      <Moldura>
        <h1 className="font-titulo text-xl font-extrabold">Não encontramos esta receita</h1>
        <p className="mt-2 text-sm text-neutro-700">
          O link pode ter sido copiado pela metade. Peça à clínica que envie de novo.
        </p>
      </Moldura>
    );
  }

  const receita = estado.dado;
  const aparencia = APARENCIA[receita.situacao];
  const pdf = `${ambiente.VITE_API_URL}/api/v1/publico/receitas/${token}/pdf`;

  return (
    <div className="min-h-dvh bg-neutro-50 px-4 py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-turquesa-700 uppercase">
            {receita.clinicaNome ?? 'Receita veterinária'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-titulo text-2xl font-extrabold tracking-tight">
              Receita nº {receita.numero}
            </h1>
            <Selo tom={aparencia.tom}>{aparencia.rotulo}</Selo>
          </div>
          <p className="text-sm text-neutro-700">
            {receita.pacienteNome} · {receita.pacienteEspecie} · tutor {receita.tutorNome}
            {receita.tutorCpf ? ` (CPF ${receita.tutorCpf})` : ''}
          </p>
        </header>

        {receita.situacao === 'cancelada' ? (
          <p
            role="alert"
            className="rounded-controle bg-controlado-fundo px-4 py-3 text-sm font-semibold text-controlado-texto"
          >
            Esta receita foi cancelada e não pode ser manipulada.
            {receita.motivoDoCancelamento ? ` Motivo: ${receita.motivoDoCancelamento}` : ''}
          </p>
        ) : null}

        {receita.situacao === 'vencida' ? (
          <p
            role="alert"
            className="rounded-controle bg-antimicrobiano-fundo px-4 py-3 text-sm font-semibold text-antimicrobiano-texto"
          >
            O prazo desta receita venceu em{' '}
            {new Date(receita.validaAte).toLocaleDateString('pt-BR')}. Procure a clínica para uma
            nova.
          </p>
        ) : null}

        {receita.formulacoes.map((f, i) => (
          <Cartao
            key={`${f.forma}-${i}`}
            titulo={`${i + 1}. ${f.forma}${f.aroma ? ` — sabor ${rotuloDoAroma(f.aroma).toLowerCase()}` : ''}`}
            acessorio={
              <span className="font-titulo text-lg font-bold">
                {f.valorEmCentavos === null ? '—' : formatarReais(f.valorEmCentavos)}
              </span>
            }
          >
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-1 text-sm">
                {f.itens.map((item, n) => (
                  <li key={`${item.descricao}-${n}`}>
                    <span className="font-semibold text-neutro-900">{item.descricao}</span>{' '}
                    <span className="text-neutro-700">
                      {item.doseMg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} mg por
                      dose
                    </span>
                  </li>
                ))}
              </ul>

              <p className="text-sm font-semibold text-turquesa-700">
                {vezesAoDia(f.frequenciaHoras)}, por {f.dias} {f.dias === 1 ? 'dia' : 'dias'}.{' '}
                {f.quantidade} {f.quantidade === 1 ? 'unidade' : 'unidades'}.
              </p>

              {f.usoContinuo ? (
                <p className="text-sm text-neutro-700">
                  Uso contínuo: o tratamento não termina no último. Procure a clínica antes de
                  acabar.
                </p>
              ) : null}

              {f.orientacao ? <p className="text-sm text-neutro-500">{f.orientacao}</p> : null}
            </div>
          </Cartao>
        ))}

        <Cartao titulo="A receita">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Linha
              rotulo="Prescrita por"
              valor={`${receita.veterinarioNome} — CRMV ${receita.crmv}`}
            />
            <Linha
              rotulo="Emitida em"
              valor={new Date(receita.emitidaEm).toLocaleDateString('pt-BR')}
            />
            <Linha
              rotulo="Válida até"
              valor={new Date(receita.validaAte).toLocaleDateString('pt-BR')}
            />
            <Linha rotulo="Prazo" valor={receita.prazoMotivo} />
          </dl>

          <p className="mt-4 flex items-baseline justify-between gap-4 border-t border-neutro-100 pt-4">
            <span className="text-sm text-neutro-500">Total</span>
            <span className="font-titulo text-2xl font-extrabold">
              {formatarReais(receita.valorTotalEmCentavos)}
            </span>
          </p>
        </Cartao>

        <a
          href={pdf}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-controle bg-turquesa-700 px-4 py-3 text-sm font-semibold text-branco hover:bg-turquesa-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquesa-700"
        >
          Abrir a receita em PDF
        </a>
      </div>
    </div>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutro-50 px-4">
      <div className="w-full max-w-md text-center" role="status">
        {children}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-neutro-500">{rotulo}</dt>
      <dd className="font-semibold text-neutro-900">{valor}</dd>
    </div>
  );
}

/** "3 vezes ao dia" diz mais ao tutor do que "1 a cada 8 h". */
function vezesAoDia(frequenciaHoras: number): string {
  const vezes = 24 / frequenciaHoras;

  return vezes === 1 ? 'Dar 1 vez ao dia' : `Dar ${vezes} vezes ao dia`;
}
