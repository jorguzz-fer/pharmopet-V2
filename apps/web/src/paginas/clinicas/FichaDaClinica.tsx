import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';
import { usePapel } from '@/sessao/SessaoContexto';
import { seloDaSituacao, type SituacaoDaClinica } from './Clinicas';
import { Equipe } from './Equipe';
import { FormularioDeClinica, type DadosDaClinica } from './FormularioDeClinica';
import { Logotipo } from './Logotipo';

type Clinica = components['schemas']['ClinicaDto'];

/**
 * A clínica por inteiro: cadastro, logotipo e equipe.
 *
 * Uma página só, e não três abas, porque as três coisas são conferidas juntas
 * quando se aprova um parceiro — e aprovar sem ter visto a equipe ou o
 * logotipo é o erro que a separação convidaria.
 */
export function FichaDaClinica() {
  const { id = '' } = useParams();
  const ehAdmin = usePapel() === 'ADMIN';
  const [editando, setEditando] = useState(false);

  const carregar = useCallback(
    () => exigir(api.GET('/api/v1/clinicas/{id}', { params: { path: { id } } })),
    [id],
  );
  const { estado, recarregar } = useConsulta(`clinica:${id}`, carregar);

  if (estado.situacao === 'carregando') return <Carregando o="a clínica" />;
  if (estado.situacao === 'falha') return <Falha motivo={estado.motivo} aoTentar={recarregar} />;

  const clinica = estado.dado;
  const selo = seloDaSituacao[clinica.situacao];

  async function salvar(dados: DadosDaClinica) {
    try {
      await exigir(api.PATCH('/api/v1/clinicas/{id}', { params: { path: { id } }, body: dados }));
      setEditando(false);
      recarregar();
    } catch (e) {
      throw new Error(mensagemDeErro(e));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link to="/clinicas" className="text-sm text-neutro-500 hover:underline">
          ← Clínicas
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-titulo text-2xl font-extrabold tracking-tight">
            {clinica.nomeFantasia}
          </h1>
          <Selo tom={selo.tom}>{selo.rotulo}</Selo>
        </div>
        <p className="text-sm text-neutro-500">
          {clinica.razaoSocial} · {clinica.cnpj}
        </p>
      </div>

      {ehAdmin ? <Situacao clinica={clinica} aoMudar={recarregar} /> : null}

      {editando ? (
        <Cartao titulo="Editar cadastro">
          <FormularioDeClinica
            inicial={clinica}
            rotuloDeEnvio="Salvar"
            aoEnviar={salvar}
            aoCancelar={() => setEditando(false)}
          />
        </Cartao>
      ) : (
        <Cartao
          titulo="Cadastro"
          acessorio={
            ehAdmin ? (
              <Botao tom="secundario" onClick={() => setEditando(true)}>
                Editar
              </Botao>
            ) : null
          }
        >
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Linha rotulo="E-mail" valor={clinica.email} />
            <Linha rotulo="Telefone" valor={clinica.telefone} />
            <Linha rotulo="WhatsApp" valor={clinica.whatsapp} />
            <Linha rotulo="Inscrição estadual" valor={clinica.inscricaoEstadual} />
            <Linha rotulo="Endereço" valor={endereco(clinica)} />
            <Linha rotulo="Responsável legal" valor={clinica.responsavelLegal} />
            <Linha rotulo="CPF do responsável" valor={clinica.cpfDoResponsavel} />
            {ehAdmin ? (
              <Linha rotulo="Observações internas" valor={clinica.observacoesInternas} />
            ) : null}
          </dl>
        </Cartao>
      )}

      <Logotipo
        clinicaId={clinica.id}
        temLogotipo={clinica.temLogotipo}
        atualizadaEm={clinica.atualizadaEm}
        podeTrocar={ehAdmin}
        aoTrocar={recarregar}
      />

      <Equipe clinicaId={clinica.id} podeEditar={ehAdmin} />
    </div>
  );
}

/**
 * Aprovar e suspender.
 *
 * Fica separado do formulário de propósito: mudar a situação tem consequência
 * imediata — uma clínica suspensa deixa de aparecer para quem prescreve — e
 * não deve acontecer de raspão ao salvar uma correção de endereço.
 */
function Situacao({ clinica, aoMudar }: { clinica: Clinica; aoMudar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function mudar(situacao: SituacaoDaClinica) {
    setErro(null);
    setEnviando(true);

    try {
      await exigir(
        api.PATCH('/api/v1/clinicas/{id}', {
          params: { path: { id: clinica.id } },
          body: { situacao },
        }),
      );
      aoMudar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Situação">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-neutro-700">
          {clinica.situacao === 'ATIVA'
            ? 'Ativa: aparece para quem prescreve e o preço segue as condições desta clínica.'
            : clinica.situacao === 'PENDENTE'
              ? 'Pendente: cadastrada, mas ainda não aparece para quem prescreve.'
              : 'Suspensa: não aparece para quem prescreve. As receitas já emitidas seguem válidas.'}
        </p>

        <div className="flex flex-wrap gap-3">
          {clinica.situacao !== 'ATIVA' ? (
            <Botao disabled={enviando} onClick={() => mudar('ATIVA')}>
              {clinica.situacao === 'PENDENTE' ? 'Ativar' : 'Reativar'}
            </Botao>
          ) : null}
          {clinica.situacao !== 'SUSPENSA' ? (
            <Botao tom="perigo" disabled={enviando} onClick={() => mudar('SUSPENSA')}>
              Suspender
            </Botao>
          ) : null}
        </div>

        {erro ? (
          <p role="alert" className="text-sm text-controlado-texto">
            {erro}
          </p>
        ) : null}
      </div>
    </Cartao>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-neutro-500">{rotulo}</dt>
      <dd className="text-sm text-neutro-900">{valor ?? '—'}</dd>
    </div>
  );
}

/** O endereço em uma linha, pulando o que não foi informado. */
function endereco(clinica: Clinica): string | null {
  const rua = [clinica.logradouro, clinica.numero].filter(Boolean).join(', ');
  const local = [clinica.bairro, clinica.cidade, clinica.uf].filter(Boolean).join(' · ');
  const linha = [rua, clinica.complemento, local, clinica.cep].filter(Boolean).join(' — ');

  return linha || null;
}
