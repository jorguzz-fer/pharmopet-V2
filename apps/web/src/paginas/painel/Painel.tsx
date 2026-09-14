import { useCallback } from 'react';
import { Link } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { formatarReais } from '@pharmopet/shared';
import { api } from '@/api/cliente';
import { useConsulta } from '@/api/consulta';
import { aparenciaDeBotao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Icone, type NomeDoIcone } from '@/componentes/Icone';
import { Selo, type TomDoSelo } from '@/componentes/Selo';
import { useSessao, usePodePrescrever } from '@/sessao/SessaoContexto';

type PainelDto = components['schemas']['PainelDto'];
type Recente = PainelDto['ultimas'][number];

const APARENCIA: Record<Recente['estado'], { tom: TomDoSelo; rotulo: string }> = {
  RASCUNHO: { tom: 'neutro', rotulo: 'rascunho' },
  EMITIDA: { tom: 'sucesso', rotulo: 'emitida' },
  CANCELADA: { tom: 'controlado', rotulo: 'cancelada' },
};

const NA_FILA: Record<string, { rotulo: string; cor: string }> = {
  EM_ANALISE: { rotulo: 'Em análise', cor: 'bg-lilas-700' },
  EM_PRODUCAO: { rotulo: 'Em produção', cor: 'bg-antimicrobiano-base' },
  PRONTO: { rotulo: 'Pronto', cor: 'bg-sucesso-base' },
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

  /*
    Quem não é ADMIN nem FARMACIA recebe `fila` e `topVeterinarios` nulos, e
    com a grade de duas colunas fixa o veterinário via metade da tela vazia ao
    lado de "Últimas receitas". A coluna da direita só existe quando há o que
    pôr nela.
  */
  const temLateral = painel.fila !== null || painel.topVeterinarios !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-neutro-500 uppercase">{hoje()}</p>
          <h1 className="mt-0.5 font-titulo text-2xl font-extrabold tracking-tight">
            {nome ? `Olá, ${primeiroNome(nome)}.` : 'Painel'}
          </h1>
        </div>
        {podePrescrever ? (
          <Link to="/receitas/nova" className={aparenciaDeBotao()}>
            <Icone nome="mais" tamanho={18} />
            Nova receita
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Numero
          icone="receita"
          rotulo="Rascunhos"
          valor={painel.rascunhos}
          ajuda="Receitas começadas e não emitidas."
          para="/receitas"
        />
        <Numero icone="confere" rotulo="Emitidas no mês" valor={painel.emitidasNoMes} />
        <Numero
          icone="relogio"
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
          icone="dinheiro"
          rotulo="Valor prescrito no mês"
          valor={formatarReais(painel.valorPrescritoNoMesEmCentavos)}
          ajuda="Soma das emitidas. Não é o que foi pago."
          // Ocupa a linha inteira no celular: os outros três são contagens de
          // um ou dois dígitos, e este é "R$ 4.812,70" — em meia coluna de
          // 390px ele estoura.
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div
        className={
          temLateral
            ? 'grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]'
            : 'grid grid-cols-1 gap-6'
        }
      >
        <Cartao
          titulo="Últimas receitas"
          semRespiro
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
            <Vazio
              icone="receita"
              titulo="Nenhuma receita ainda"
              acao={
                podePrescrever ? (
                  <Link to="/receitas/nova" className={aparenciaDeBotao({ tom: 'secundario' })}>
                    <Icone nome="mais" tamanho={17} />
                    Nova receita
                  </Link>
                ) : undefined
              }
            >
              {podePrescrever
                ? 'Nenhuma receita ainda. Comece por “Nova receita”.'
                : 'Nenhuma receita ainda.'}
            </Vazio>
          ) : (
            <ul className="flex flex-col">
              {painel.ultimas.map((r) => (
                <li key={r.id} className="border-b border-neutro-100 last:border-b-0">
                  <LinhaRecente receita={r} />
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        {temLateral ? (
          <div className="flex flex-col gap-6">
            {/* Nulo quer dizer "não é para este papel"; lista vazia quer dizer
                "não há nenhum". Só o primeiro caso esconde o bloco. */}
            {painel.fila ? (
              <Cartao
                titulo="Fila da farmácia"
                acessorio={
                  <Link
                    to="/pedidos"
                    className="text-sm font-semibold text-turquesa-700 hover:underline"
                  >
                    Abrir a fila
                  </Link>
                }
              >
                <ul className="flex flex-col gap-3">
                  {painel.fila.map((degrau) => {
                    const aparencia = NA_FILA[degrau.estado];

                    return (
                      <li key={degrau.estado} className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`size-2.5 shrink-0 rounded-pill ${aparencia?.cor ?? 'bg-neutro-300'}`}
                        />
                        <span className="flex-1 text-sm text-neutro-700">
                          {aparencia?.rotulo ?? degrau.estado}
                        </span>
                        <span className="font-titulo text-lg font-extrabold">
                          {degrau.quantidade}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Cartao>
            ) : null}

            {painel.topVeterinarios ? (
              <Cartao titulo="Quem mais prescreveu no mês">
                {painel.topVeterinarios.length === 0 ? (
                  <Vazio>Nenhuma receita emitida neste mês.</Vazio>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {painel.topVeterinarios.map((v, i) => (
                      <li
                        key={v.id}
                        className="flex items-center gap-3 rounded-controle border border-neutro-200 px-3 py-2.5"
                      >
                        <span
                          aria-hidden="true"
                          className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-turquesa-50 text-xs font-bold text-turquesa-700"
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-neutro-900">
                            {v.nome}
                          </span>
                          {v.crmv ? (
                            <span className="block text-micro text-neutro-500">{v.crmv}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-sm text-neutro-500">
                          {v.receitas === 1 ? '1 receita' : `${v.receitas} receitas`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Cartao>
            ) : null}
          </div>
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
 *
 * O ícone mora **dentro** do parágrafo do rótulo, e não ao lado dele: o número
 * precisa continuar sendo irmão do rótulo no DOM, e há teste que depende disso.
 */
function Numero({
  rotulo,
  valor,
  ajuda,
  para,
  icone,
  tom = 'neutro',
  className = '',
}: {
  rotulo: string;
  valor: number | string;
  ajuda?: string;
  para?: string;
  icone: NomeDoIcone;
  tom?: 'neutro' | 'atencao';
  className?: string;
}) {
  const atencao = tom === 'atencao';

  const corpo = (
    <>
      <p
        className={[
          'flex items-center gap-2 text-sm font-semibold',
          atencao ? 'text-antimicrobiano-texto' : 'text-neutro-500',
        ].join(' ')}
      >
        <Icone nome={icone} tamanho={17} />
        {rotulo}
      </p>
      <p
        className={[
          'mt-2 font-titulo text-2xl font-extrabold tracking-tight sm:text-3xl',
          atencao ? 'text-antimicrobiano-texto' : 'text-neutro-900',
        ].join(' ')}
      >
        {valor}
      </p>
      {ajuda ? (
        <p
          className={[
            'mt-1 text-xs',
            atencao ? 'text-antimicrobiano-texto' : 'text-neutro-500',
          ].join(' ')}
        >
          {ajuda}
        </p>
      ) : null}
    </>
  );

  const classe = [
    'rounded-card border px-4 py-4 shadow-carta transition-colors',
    atencao
      ? 'border-antimicrobiano-borda bg-antimicrobiano-fundo'
      : 'border-neutro-200 bg-neutro-0',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return para ? (
    <Link
      to={para}
      className={`${classe} block ${atencao ? 'hover:border-antimicrobiano-base' : 'hover:bg-neutro-50'}`}
    >
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
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-neutro-50"
    >
      <span className="w-12 shrink-0 font-mono text-xs text-neutro-500">
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

/**
 * A data por extenso.
 *
 * Ancora o "vencem em 7 dias" e o "no mês" logo abaixo: sem ela, quem volta a
 * uma aba esquecida de ontem lê os números como se fossem de hoje.
 */
function hoje(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
