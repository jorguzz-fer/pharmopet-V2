import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { useAtrasado, useConsulta } from '@/api/consulta';
import { aparenciaDeBotao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';
import { usePapel } from '@/sessao/SessaoContexto';

type Clinica = components['schemas']['ClinicaDto'];
export type SituacaoDaClinica = Clinica['situacao'];

/**
 * A situação, dita em palavra e não só em cor.
 *
 * Uma clínica suspensa continua aparecendo na lista de propósito: sumir seria
 * indistinguível de nunca ter existido, e quem procura por que o parceiro
 * parou de emitir precisa encontrá-lo.
 */
export const seloDaSituacao: Record<
  SituacaoDaClinica,
  { tom: 'sucesso' | 'neutro' | 'controlado'; rotulo: string }
> = {
  ATIVA: { tom: 'sucesso', rotulo: 'Ativa' },
  PENDENTE: { tom: 'neutro', rotulo: 'Pendente' },
  SUSPENSA: { tom: 'controlado', rotulo: 'Suspensa' },
};

/**
 * Clínicas parceiras.
 *
 * Quem é ADMIN vê todas e cadastra. Quem tem papel CLINICA cai aqui com a sua
 * — a API já devolve só o que cabe a cada um (ADR 0012), e a tela não repete
 * a regra, só deixa de oferecer o que levaria a um 403.
 */
export function Clinicas() {
  const [busca, setBusca] = useState('');
  const buscaAtrasada = useAtrasado(busca);
  const ehAdmin = usePapel() === 'ADMIN';

  const carregar = useCallback(() => exigir(api.GET('/api/v1/clinicas', {})), []);
  const { estado, recarregar } = useConsulta('clinicas', carregar);

  const filtro = buscaAtrasada.trim().toLowerCase();
  const visiveis =
    estado.situacao === 'ok'
      ? estado.dado.clinicas.filter(
          (c) =>
            !filtro ||
            c.nomeFantasia.toLowerCase().includes(filtro) ||
            c.razaoSocial.toLowerCase().includes(filtro) ||
            c.cnpj.replace(/\D/g, '').includes(filtro.replace(/\D/g, '')),
        )
      : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Clínicas</h1>
        {ehAdmin ? (
          <Link to="/clinicas/nova" className={aparenciaDeBotao()}>
            Nova clínica
          </Link>
        ) : null}
      </div>

      {/* A busca é local: a lista de parceiros é curta, e ir ao servidor a cada
          tecla só adicionaria espera a algo que já está na memória. */}
      <Campo
        rotulo="Buscar"
        type="search"
        placeholder="Nome ou CNPJ"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {estado.situacao === 'carregando' ? <Carregando o="clínicas" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} aoTentar={recarregar} /> : null}
      {estado.situacao === 'ok' ? (
        <Lista clinicas={visiveis} buscando={filtro !== ''} podeCadastrar={ehAdmin} />
      ) : null}
    </div>
  );
}

function Lista({
  clinicas,
  buscando,
  podeCadastrar,
}: {
  clinicas: Clinica[];
  buscando: boolean;
  podeCadastrar: boolean;
}) {
  if (clinicas.length === 0) {
    return (
      <Vazio
        icone={buscando ? 'busca' : 'clinicas'}
        titulo={buscando ? 'Nada encontrado' : 'Nenhuma clínica cadastrada'}
      >
        {buscando
          ? 'Nenhuma clínica com esse nome ou CNPJ.'
          : // O texto do vazio depende do papel porque ele mandava todo mundo
            // clicar num botão que só o ADMIN enxerga — quem não é ficava
            // procurando na tela a ação que o próprio texto prometia.
            podeCadastrar
            ? 'Comece por “Nova clínica”.'
            : 'Quem cadastra clínica parceira é a administração da Pharmopet.'}
      </Vazio>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {clinicas.map((c) => {
        const selo = seloDaSituacao[c.situacao];

        return (
          <li key={c.id}>
            <Link
              to={`/clinicas/${c.id}`}
              className="flex min-h-[var(--altura-controle)] flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-neutro-200 bg-neutro-0 px-4 py-3 hover:bg-neutro-100"
            >
              <span className="font-semibold text-neutro-900">{c.nomeFantasia}</span>
              <span className="text-sm text-neutro-500">{c.cnpj}</span>
              <Selo tom={selo.tom}>{selo.rotulo}</Selo>
              <span className="ml-auto text-sm text-neutro-500">
                {c.quantidadeDeUsuarios === 1 ? '1 pessoa' : `${c.quantidadeDeUsuarios} pessoas`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
