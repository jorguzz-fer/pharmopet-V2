import { useCallback } from 'react';
import { Link } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { formatarReais } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { useConsulta } from '@/api/consulta';
import { aparenciaDeBotao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Selo, type TomDoSelo } from '@/componentes/Selo';
import { useSessao, usePodePrescrever } from '@/sessao/SessaoContexto';

type PainelDto = components['schemas']['PainelDto'];
type Recente = PainelDto['ultimas'][number];

const APARENCIA: Record<Recente['estado'], { tom: TomDoSelo; rotulo: string }> = {
  RASCUNHO: { tom: 'neutro', rotulo: 'rascunho' },
  EMITIDA: { tom: 'sucesso', rotulo: 'emitida' },
  CANCELADA: { tom: 'controlado', rotulo: 'cancelada' },
};

const NA_FILA: Record<string, string> = {
  EM_ANALISE: 'Em análise',
  EM_PRODUCAO: 'Em produção',
  PRONTO: 'Pronto',
};

/**
 * A tela inicial (ADR 0017).
 *
 * Responde às perguntas de quem chega de manhã: o que está parado esperando
 * mim, o que vence esta semana, quanto saiu no mês. Antes a v2 abria na lista
 * de receitas, que é um registro — bom para procurar, inútil para decidir o
 * que fazer primeiro.
 */
export function Painel() {
  const carregar = useCallback(() => exigir(api.GET('/api/v1/painel')), []);
  const { estado, recarregar } = useConsulta('painel', carregar);
  const { estado: sessao } = useSessao();
  const podePrescrever = usePodePrescrever();
  const nome = sessao.situacao === 'dentro' ? sessao.usuario.nome : null;

  if (estado.situacao === 'carregando') return <Carregando o="o painel" />;
  if (estado.situacao === 'falha') return <Falha motivo={estado.motivo} aoTentar={recarregar} />;

  const painel = estado.dado;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-titulo text-2xl font-extrabold tracking-tight">
            {nome ? `Olá, ${primeiroNome(nome)}.` : 'Painel'}
          </h1>
          <p className="mt-1 text-sm text-neutro-500">O que está aberto agora.</p>
        </div>
        {podePrescrever ? (
          <Link to="/receitas/nova" className={aparenciaDeBotao()}>
            Nova receita
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          rotulo="Rascunhos"
          valor={painel.rascunhos}
          ajuda="Começadas e não emitidas."
          para="/receitas"
        />
        <Numero rotulo="Emitidas no mês" valor={painel.emitidasNoMes} />
        <Numero
          rotulo="Vencem em 7 dias"
          // Só destaca quando há: um número em vermelho sobre zero treina a
          // pessoa a ignorar a cor quando ela finalmente importar.
          tom={painel.vencendo > 0 ? 'atencao' : 'neutro'}
          valor={painel.vencendo}
          ajuda="Emitidas que perdem a validade."
        />
        {/*
          "Valor prescrito", e não "faturamento" (ADR 0017). É a soma das
          receitas emitidas no mês; não há meio de pagamento ainda, então
          ninguém pagou nada disso. A v1 chamava de faturamento a soma de todo
          orçamento criado, e a tela dizia que entrou dinheiro que talvez nunca
          entrasse.
        */}
        <Numero
          rotulo="Valor prescrito no mês"
          valor={formatarReais(painel.valorPrescritoNoMesEmCentavos)}
          ajuda="Soma das emitidas. Não é o que foi pago."
        />
      </div>

      {/* Nulo quer dizer "não é para este papel"; lista vazia quer dizer "não
          há nenhum". Só o primeiro caso esconde o bloco. */}
      {painel.fila ? (
        <Cartao
          titulo="Fila da farmácia"
          acessorio={
            <Link to="/pedidos" className="text-sm font-semibold text-turquesa-700 hover:underline">
              Abrir a fila
            </Link>
          }
        >
          <ul className="grid gap-3 sm:grid-cols-3">
            {painel.fila.map((degrau) => (
              <li
                key={degrau.estado}
                className="flex items-center justify-between rounded-card border border-neutro-200 px-4 py-3"
              >
                <span className="text-sm font-semibold text-neutro-700">
                  {NA_FILA[degrau.estado] ?? degrau.estado}
                </span>
                <span className="font-titulo text-xl font-extrabold">{degrau.quantidade}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao
          titulo="Últimas receitas"
          acessorio={
            <Link
              to="/receitas"
              className="text-sm font-semibold text-turquesa-700 hover:underline"
            >
              Ver todas
            </Link>
          }
        >
          {painel.ultimas.length === 0 ? (
            <Vazio>
              {podePrescrever
                ? 'Nenhuma receita ainda. Comece por “Nova receita”.'
                : 'Nenhuma receita ainda.'}
            </Vazio>
          ) : (
            <ul className="flex flex-col gap-2">
              {painel.ultimas.map((r) => (
                <li key={r.id}>
                  <LinhaRecente receita={r} />
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        {painel.topVeterinarios ? (
          <Cartao titulo="Quem mais prescreveu no mês">
            {painel.topVeterinarios.length === 0 ? (
              <Vazio>Nenhuma receita emitida neste mês.</Vazio>
            ) : (
              <ol className="flex flex-col gap-2">
                {painel.topVeterinarios.map((v, i) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-3 rounded-card border border-neutro-200 px-4 py-3"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-turquesa-50 text-sm font-bold text-turquesa-700"
                    >
                      {i + 1}
                    </span>
                    <span className="font-semibold text-neutro-900">{v.nome}</span>
                    {v.crmv ? <span className="text-sm text-neutro-500">{v.crmv}</span> : null}
                    <span className="ml-auto text-sm text-neutro-500">
                      {v.receitas === 1 ? '1 receita' : `${v.receitas} receitas`}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Cartao>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Um número do topo.
 *
 * Vira link quando há para onde ir: "3 rascunhos" sem caminho até eles é uma
 * informação que obriga a pessoa a procurar sozinha o que a tela já sabe.
 */
function Numero({
  rotulo,
  valor,
  ajuda,
  para,
  tom = 'neutro',
}: {
  rotulo: string;
  valor: number | string;
  ajuda?: string;
  para?: string;
  tom?: 'neutro' | 'atencao';
}) {
  const corpo = (
    <>
      <p className="text-sm font-semibold text-neutro-500">{rotulo}</p>
      <p
        className={[
          'mt-1 font-titulo text-3xl font-extrabold tracking-tight',
          tom === 'atencao' ? 'text-antimicrobiano-texto' : 'text-neutro-900',
        ].join(' ')}
      >
        {valor}
      </p>
      {ajuda ? <p className="mt-1 text-xs text-neutro-500">{ajuda}</p> : null}
    </>
  );

  const classe = 'rounded-card border border-neutro-200 bg-neutro-0 px-4 py-4';

  return para ? (
    <Link to={para} className={`${classe} block hover:bg-neutro-100`}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

function LinhaRecente({ receita }: { receita: Recente }) {
  const aparencia = APARENCIA[receita.estado];

  return (
    <Link
      to={`/receitas/${receita.id}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-neutro-200 px-4 py-3 hover:bg-neutro-100"
    >
      <span className="font-mono text-sm text-neutro-500">
        {receita.numero === null ? '—' : `nº ${receita.numero}`}
      </span>
      <span className="font-semibold text-neutro-900">{receita.pacienteNome}</span>
      <span className="text-sm text-neutro-500">{receita.tutorNome}</span>
      <Selo tom={aparencia.tom}>{aparencia.rotulo}</Selo>
      <span className="ml-auto text-sm text-neutro-500">
        {new Date(receita.criadaEm).toLocaleDateString('pt-BR')}
      </span>
    </Link>
  );
}

/** O primeiro nome basta para cumprimentar, e cabe no celular. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
