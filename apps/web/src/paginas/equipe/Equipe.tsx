import { useCallback, useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { useAtrasado, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Carregando, Falha, Vazio } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';
import { rotuloDoPapel } from '@/sessao/papeis';
import { useSessao } from '@/sessao/SessaoContexto';
import { NovaPessoa } from './NovaPessoa';
import { Pessoa } from './Pessoa';

type Usuario = components['schemas']['ListaDeUsuariosDto']['usuarios'][number];

/**
 * Quem tem conta na instalação.
 *
 * Até aqui só existia `usuario:criar`, o comando de servidor — que é o certo
 * para a primeira conta, quando não há ninguém para autorizar, e errado para as
 * seguintes: criar o quarto veterinário não deveria exigir acesso ao servidor
 * de produção.
 *
 * Quem foi desativado continua na lista, como a clínica suspensa: sumir seria
 * indistinguível de nunca ter existido, e quem procura por que alguém parou de
 * entrar precisa achar a pessoa.
 */
export function Equipe() {
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const buscaAtrasada = useAtrasado(busca);
  const { estado: sessao } = useSessao();
  const euId = sessao.situacao === 'dentro' ? sessao.usuario.id : null;

  const carregar = useCallback(
    () =>
      exigir(
        api.GET('/api/v1/auth/usuarios', {
          params: { query: buscaAtrasada.trim() ? { busca: buscaAtrasada.trim() } : {} },
        }),
      ),
    [buscaAtrasada],
  );
  const { estado, recarregar } = useConsulta(`equipe:${buscaAtrasada}`, carregar);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Equipe</h1>
          <p className="mt-1 text-sm text-neutro-500">
            Quem tem conta nesta instalação, e o que cada um pode fazer.
          </p>
        </div>
        {!criando ? <Botao onClick={() => setCriando(true)}>Nova pessoa</Botao> : null}
      </div>

      {criando ? (
        <NovaPessoa
          aoFechar={() => setCriando(false)}
          aoCriar={() => {
            setCriando(false);
            recarregar();
          }}
        />
      ) : null}

      <Campo
        rotulo="Buscar"
        type="search"
        placeholder="Nome ou e-mail"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {estado.situacao === 'carregando' ? <Carregando o="a equipe" /> : null}
      {estado.situacao === 'falha' ? <Falha motivo={estado.motivo} aoTentar={recarregar} /> : null}

      {estado.situacao === 'ok' ? (
        estado.dado.usuarios.length === 0 ? (
          <Vazio
            icone={busca.trim() ? 'busca' : 'equipe'}
            titulo={busca.trim() ? 'Nada encontrado' : 'Nenhuma conta ainda'}
          >
            {busca.trim()
              ? 'Ninguém com esse nome ou e-mail.'
              : 'Nenhuma conta ainda. Comece por “Nova pessoa”.'}
          </Vazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {estado.dado.usuarios.map((u) => (
              <li key={u.id}>
                {aberta === u.id ? (
                  <Pessoa
                    usuario={u}
                    souEu={u.id === euId}
                    aoFechar={() => setAberta(null)}
                    aoSalvar={() => {
                      setAberta(null);
                      recarregar();
                    }}
                  />
                ) : (
                  <Linha usuario={u} souEu={u.id === euId} aoAbrir={() => setAberta(u.id)} />
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function Linha({
  usuario,
  souEu,
  aoAbrir,
}: {
  usuario: Usuario;
  souEu: boolean;
  aoAbrir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={[
        'flex w-full min-h-[var(--altura-controle)] flex-wrap items-center gap-x-4 gap-y-1 rounded-card border px-4 py-3 text-left hover:bg-neutro-100',
        // Desativado fica visivelmente apagado, e não só marcado: a lista é lida
        // de relance, e um selo entre outros selos passa batido.
        usuario.desativado
          ? 'border-neutro-200 bg-neutro-100 opacity-70'
          : 'border-neutro-200 bg-neutro-0',
      ].join(' ')}
    >
      <span className="font-semibold text-neutro-900">{usuario.nome}</span>
      {souEu ? <Selo tom="neutro">você</Selo> : null}
      <span className="text-sm text-neutro-500">{usuario.email}</span>
      <Selo tom={usuario.papel === 'ADMIN' ? 'antimicrobiano' : 'neutro'}>
        {rotuloDoPapel[usuario.papel]}
      </Selo>
      {usuario.crmv ? <span className="text-sm text-neutro-500">{usuario.crmv}</span> : null}
      <span className="ml-auto flex items-center gap-2">
        {/* Bloqueado é temporário e automático; desativado é decisão de alguém.
            Dizer os dois igual faria a farmácia esperar passar o que não passa. */}
        {usuario.bloqueado ? <Selo tom="controlado">bloqueado por tentativas</Selo> : null}
        {usuario.desativado ? <Selo tom="controlado">desativado</Selo> : null}
      </span>
    </button>
  );
}
