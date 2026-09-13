import { useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro } from '@/api/consulta';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { PAPEIS, SeletorDePapel } from './SeletorDePapel';

type Usuario = components['schemas']['ListaDeUsuariosDto']['usuarios'][number];
type Papel = (typeof PAPEIS)[number];

/**
 * Uma conta aberta para correção.
 *
 * O e-mail aparece e não se edita: ele é a identidade de login, e trocá-lo é
 * trocar quem entra ali. A senha também não — mexer na senha de outra pessoa é
 * outro risco, e não cabe no mesmo formulário que conserta um nome.
 */
export function Pessoa({
  usuario,
  souEu,
  aoFechar,
  aoSalvar,
}: {
  usuario: Usuario;
  souEu: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [nome, setNome] = useState(usuario.nome);
  const [papel, setPapel] = useState<Papel>(usuario.papel);
  const [crmv, setCrmv] = useState(usuario.crmv ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const pronto = nome.trim().length >= 2;

  async function alterar(corpo: {
    nome?: string;
    papel?: Papel;
    crmv?: string | null;
    desativado?: boolean;
  }) {
    setErro(null);
    setSalvando(true);
    try {
      await exigir(
        api.PATCH('/api/v1/auth/usuarios/{id}', {
          params: { path: { id: usuario.id } },
          body: corpo,
        }),
      );
      aoSalvar();
    } catch (e) {
      setErro(mensagemDeErro(e));
      setSalvando(false);
    }
  }

  return (
    <Cartao
      titulo={usuario.email}
      acessorio={
        <Botao tom="secundario" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <div className="flex flex-col gap-4">
        {erro ? (
          <p
            role="alert"
            className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
          >
            {erro}
          </p>
        ) : null}

        {usuario.desativado ? (
          <Aviso tom="atencao">
            Esta conta está desativada: a pessoa não entra, e a sessão que ela tivesse aberta caiu.
          </Aviso>
        ) : null}

        {usuario.bloqueado ? (
          <Aviso tom="informacao">
            Bloqueada por senhas erradas seguidas. O bloqueio vence sozinho — não é preciso fazer
            nada.
          </Aviso>
        ) : null}

        <Campo
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          ajuda="O e-mail não muda: é por ele que a pessoa entra."
        />

        <SeletorDePapel valor={papel} aoMudar={setPapel} />

        {papel === 'VETERINARIO' ? (
          <Campo
            rotulo="CRMV"
            placeholder="SP 28.114"
            value={crmv}
            onChange={(e) => setCrmv(e.target.value)}
            ajuda="Vai congelado em cada receita emitida. Mudar aqui não reescreve as antigas."
          />
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-neutro-100 pt-4">
          <Botao
            onClick={() =>
              alterar({
                nome: nome.trim(),
                papel,
                crmv: papel === 'VETERINARIO' ? crmv.trim() : null,
              })
            }
            disabled={salvando || !pronto}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>

          {/* Desligar a si mesmo derruba a própria sessão na hora, e o conserto
              passa a exigir o comando no servidor. A API recusa; a tela nem
              oferece. */}
          {souEu ? null : usuario.desativado ? (
            <Botao
              tom="secundario"
              onClick={() => alterar({ desativado: false })}
              disabled={salvando}
            >
              Reativar
            </Botao>
          ) : (
            <Botao tom="perigo" onClick={() => alterar({ desativado: true })} disabled={salvando}>
              Desativar
            </Botao>
          )}
        </div>
      </div>
    </Cartao>
  );
}
