import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErroDeApi, exigir } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Moldura } from '@/paginas/senha/Moldura';

function mensagemDe(erro: unknown): string {
  if (erro instanceof ErroDeApi) {
    if (erro.status === 400) return 'Confira o e-mail digitado.';
    if (erro.status === 429) return 'Muitos pedidos. Espere um minuto e tente de novo.';
    // 503 é a instalação sem e-mail configurado, e a própria API diz isso —
    // é a única resposta desta tela que fala de configuração, não de conta.
    if (erro.status === 503) {
      return 'A recuperação por e-mail não está configurada. Fale com a administração da farmácia.';
    }
  }
  return 'Não foi possível falar com o sistema. Verifique a conexão.';
}

/**
 * Pedir o link de redefinição.
 *
 * A tela **não diz se a conta existe** — nem no sucesso, nem no erro. Aqui o
 * e-mail do veterinário é o identificador, e uma tela que respondesse "não
 * encontramos esse e-mail" entregaria a carteira de clientes da farmácia a
 * quem chegasse com uma lista de endereços. A API já responde igual nos dois
 * casos; o texto daqui precisa combinar, senão a proteção do servidor se perde
 * na redação.
 */
export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      await exigir(api.POST('/api/v1/auth/senha/esqueci', { body: { email } }));
      setPedido(true);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura titulo="Esqueci minha senha">
      {pedido ? (
        <>
          {/*
            A frase é condicional de propósito: "se houver uma conta". Dizer
            "enviamos" afirmaria que a conta existe, que é exatamente o que a
            API se recusa a contar.
          */}
          <p role="status" className="mt-1 text-sm text-neutro-700">
            Se houver uma conta com <strong>{email}</strong>, o link de redefinição já saiu para
            essa caixa de entrada. Ele vale por uma hora e só funciona uma vez.
          </p>
          <p className="mt-4 text-sm text-neutro-500">
            Não chegou? Confira a caixa de spam. Se o endereço estiver errado, tente de novo — e se
            a conta for de alguém que saiu da equipe, quem resolve é a administração.
          </p>
          <p className="mt-6 text-sm">
            <Link to="/entrar" className="font-semibold text-turquesa-700 underline">
              Voltar para a entrada
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-neutro-500">
            Informe o e-mail cadastrado. Mandamos um link para você escolher uma senha nova.
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

            {erro ? (
              <p
                role="alert"
                className="rounded-controle bg-controlado-fundo px-3 py-2 text-sm text-controlado-texto"
              >
                {erro}
              </p>
            ) : null}

            <Botao type="submit" larguraTotal disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar o link'}
            </Botao>
          </form>

          <p className="mt-6 text-sm">
            <Link to="/entrar" className="font-semibold text-turquesa-700 underline">
              Lembrei a senha
            </Link>
          </p>
        </>
      )}
    </Moldura>
  );
}
