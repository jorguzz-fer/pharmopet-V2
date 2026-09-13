import { useCallback, useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { useAtrasado, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { NovoTutor } from '@/paginas/tutores/NovoTutor';

type Tutor = components['schemas']['TutorDto'];

/**
 * Passo 1: de quem é o bicho.
 *
 * A busca vem primeiro e o cadastro fica atrás de um botão, como na tela de
 * tutores e pelo mesmo motivo: o caso frequente é o tutor já existir, e abrir
 * direto no formulário convida a cadastrar de novo quem já está lá — o CPF
 * único só pega isso quando o documento foi informado, e aqui ele é opcional.
 */
export function PassoDoTutor({ aoEscolher }: { aoEscolher: (tutor: Tutor) => void }) {
  const [busca, setBusca] = useState('');
  const [cadastrando, setCadastrando] = useState(false);
  const buscaAtrasada = useAtrasado(busca);

  const carregar = useCallback(
    () =>
      exigir(
        api.GET('/api/v1/receituario/tutores', {
          params: { query: buscaAtrasada.trim() ? { busca: buscaAtrasada.trim() } : {} },
        }),
      ),
    [buscaAtrasada],
  );

  const { estado, recarregar } = useConsulta(`passo-tutor:${buscaAtrasada}`, carregar);

  if (cadastrando) {
    return (
      <Cartao
        titulo="Novo tutor"
        acessorio={
          <Botao tom="secundario" onClick={() => setCadastrando(false)}>
            Voltar à busca
          </Botao>
        }
      >
        {/* Assim que o cadastro volta, o passo avança sozinho: quem acabou de
            digitar os dados do tutor não precisa procurá-lo numa lista. */}
        <NovoTutor comMoldura={false} rotuloDoBotao="Cadastrar e continuar" aoCriar={aoEscolher} />
      </Cartao>
    );
  }

  return (
    <Cartao
      titulo="De quem é o paciente?"
      acessorio={<Botao onClick={() => setCadastrando(true)}>Novo tutor</Botao>}
    >
      <div className="flex flex-col gap-4">
        <Campo
          rotulo="Buscar tutor"
          type="search"
          placeholder="Nome ou CPF"
          autoFocus
          ajuda="O CPF pode ser digitado com ou sem pontuação."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        {estado.situacao === 'carregando' ? <Carregando o="tutores" /> : null}
        {estado.situacao === 'falha' ? (
          <Falha motivo={estado.motivo} aoTentar={recarregar} />
        ) : null}
        {estado.situacao === 'ok' ? (
          <Lista tutores={estado.dado.tutores} busca={busca} aoEscolher={aoEscolher} />
        ) : null}
      </div>
    </Cartao>
  );
}

function Lista({
  tutores,
  busca,
  aoEscolher,
}: {
  tutores: Tutor[];
  busca: string;
  aoEscolher: (tutor: Tutor) => void;
}) {
  if (tutores.length === 0) {
    return (
      <Vazio>
        {busca.trim()
          ? 'Nenhum tutor com esse nome ou CPF. Confira a digitação, ou use “Novo tutor”.'
          : 'Nenhum tutor cadastrado ainda. Comece por “Novo tutor”.'}
      </Vazio>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tutores.map((t) => (
        <li key={t.id}>
          {/*
            Botão, e não link: aqui a escolha não é "ir ver a ficha", é
            "seguir com este". Um link levaria para fora do wizard e perderia
            o passo.
          */}
          <button
            type="button"
            onClick={() => aoEscolher(t)}
            className="flex min-h-[var(--altura-controle)] w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-neutro-200 bg-neutro-0 px-4 py-3 text-left hover:border-turquesa-500 hover:bg-neutro-100"
          >
            <span className="font-semibold text-neutro-900">{t.nome}</span>
            {t.cpf ? <span className="text-sm text-neutro-500">{t.cpf}</span> : null}
            {t.telefone ? <span className="text-sm text-neutro-500">{t.telefone}</span> : null}
            <span className="ml-auto text-sm text-neutro-500">
              {t.quantidadeDePacientes === 1
                ? '1 paciente'
                : `${t.quantidadeDePacientes} pacientes`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
