import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { useAtrasado, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { NovoTutor } from '@/paginas/tutores/NovoTutor';
import { usePodeCadastrarFicha } from '@/sessao/SessaoContexto';

type Tutor = components['schemas']['TutorDto'];

/**
 * Busca e cadastro de tutor.
 *
 * A busca vem primeiro, e o cadastro fica atrás de um botão, porque o caso
 * frequente é o tutor já existir: abrir direto no formulário convidaria a
 * cadastrar de novo quem já está lá, e o CPF único só pega isso quando o
 * documento foi informado.
 */
export function Tutores() {
  const [busca, setBusca] = useState('');
  const [cadastrando, setCadastrando] = useState(false);
  const buscaAtrasada = useAtrasado(busca);
  const podeCadastrar = usePodeCadastrarFicha();

  const carregar = useCallback(
    () =>
      exigir(
        api.GET('/api/v1/receituario/tutores', {
          params: { query: buscaAtrasada.trim() ? { busca: buscaAtrasada.trim() } : {} },
        }),
      ),
    [buscaAtrasada],
  );

  const { estado, recarregar } = useConsulta(`tutores:${buscaAtrasada}`, carregar);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Tutores</h1>
        {podeCadastrar ? (
          <Botao
            tom={cadastrando ? 'secundario' : 'primario'}
            onClick={() => setCadastrando((c) => !c)}
          >
            {cadastrando ? 'Cancelar' : 'Novo tutor'}
          </Botao>
        ) : null}
      </div>

      {cadastrando ? (
        <NovoTutor
          aoCriar={() => {
            setCadastrando(false);
            recarregar();
          }}
        />
      ) : null}

      <Campo
        rotulo="Buscar"
        type="search"
        placeholder="Nome ou CPF"
        ajuda="O CPF pode ser digitado com ou sem pontuação."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {estado.situacao === 'carregando' ? <Carregando o="tutores" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} aoTentar={recarregar} /> : null}
      {estado.situacao === 'ok' ? (
        <ListaDeTutores tutores={estado.dado.tutores} busca={busca} />
      ) : null}
    </div>
  );
}

function ListaDeTutores({ tutores, busca }: { tutores: Tutor[]; busca: string }) {
  if (tutores.length === 0) {
    return (
      <Vazio
        icone={busca.trim() ? 'busca' : 'tutores'}
        titulo={busca.trim() ? 'Nada encontrado' : 'Nenhum tutor cadastrado'}
      >
        {busca.trim()
          ? 'Nenhum tutor com esse nome ou CPF. Confira a digitação, ou cadastre.'
          : 'Comece por “Novo tutor”.'}
      </Vazio>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tutores.map((t) => (
        <li key={t.id}>
          <Link
            to={`/tutores/${t.id}`}
            className="flex min-h-[var(--altura-controle)] flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-neutro-200 bg-neutro-0 px-4 py-3 hover:bg-neutro-100"
          >
            <span className="font-semibold text-neutro-900">{t.nome}</span>
            {t.cpf ? <span className="text-sm text-neutro-500">{t.cpf}</span> : null}
            {t.telefone ? <span className="text-sm text-neutro-500">{t.telefone}</span> : null}
            <span className="ml-auto text-sm text-neutro-500">
              {t.quantidadeDePacientes === 1
                ? '1 paciente'
                : `${t.quantidadeDePacientes} pacientes`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
