import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ErroDeApi } from '@pharmopet/api-client';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { CampoDeSenha } from '@/componentes/CampoDeSenha';
import { Marca } from '@/componentes/Marca';
import { useSessao } from '@/sessao/SessaoContexto';

function mensagemDe(erro: unknown): string {
  if (erro instanceof ErroDeApi) {
    if (erro.status === 401) return 'E-mail ou senha incorretos.';
    if (erro.status === 429) return 'Muitas tentativas. Espere um minuto e tente de novo.';
    if (erro.status === 400) return 'Confira o e-mail digitado.';
  }
  return 'Não foi possível falar com o sistema. Verifique a conexão.';
}

export function Login() {
  const { estado, entrar } = useSessao();
  const local = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (estado.situacao === 'dentro') {
    const de = (local.state as { de?: string } | null)?.de;
    return <Navigate to={de ?? '/'} replace />;
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      await entrar(email, senha);
    } catch (e) {
      setErro(mensagemDe(e));
      // A senha sai do campo, o e-mail fica. Quem errou a senha vai redigitá-la
      // de qualquer forma, e deixá-la na tela só aumenta a janela de alguém ler
      // por cima do ombro — num balcão de clínica, isso acontece.
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Painel da marca. Some no celular: numa tela de 390px, o que importa é
          o formulário estar acima da dobra. */}
      <div className="hidden flex-col justify-between bg-turquesa-900 p-10 lg:flex">
        <Marca sobreEscuro />
        <div>
          <h2 className="font-titulo text-3xl font-extrabold tracking-tight text-neutro-0">
            Prescrição e manipulação, no mesmo lugar.
          </h2>
          <p className="mt-3 max-w-sm text-base text-sobre-escuro-texto">
            Fórmula magistral com preço fechado na hora, receita que chega pronta ao tutor.
          </p>
        </div>
        <p className="text-xs text-sobre-escuro-texto">Uso restrito a profissionais cadastrados.</p>
      </div>

      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Marca />
          </div>

          <h1 className="mt-8 font-titulo text-2xl font-extrabold tracking-tight lg:mt-0">
            Entrar
          </h1>
          <p className="mt-1 text-sm text-neutro-500">
            Use o e-mail cadastrado pela administração da farmácia.
          </p>

          <form onSubmit={aoEnviar} className="mt-6 flex flex-col gap-4" noValidate>
            <Campo
              rotulo="E-mail"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <CampoDeSenha
              rotulo="Senha"
              name="senha"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />

            {/* role="alert" para o leitor de tela anunciar a recusa: sem isto,
                quem não enxerga a tela tenta de novo sem saber o que houve. */}
            {erro ? (
              <p
                role="alert"
                className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
              >
                {erro}
              </p>
            ) : null}

            <Botao type="submit" larguraTotal disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </Botao>
          </form>

          <p className="mt-6 text-xs text-neutro-500">
            Esqueceu a senha? Fale com a administração — por segurança, a redefinição não é
            automática.
          </p>
        </div>
      </div>
    </div>
  );
}
