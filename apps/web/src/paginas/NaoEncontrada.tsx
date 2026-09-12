import { Link } from 'react-router';
import { Cartao } from '@/componentes/Cartao';

export function NaoEncontrada() {
  return (
    <Cartao>
      <h1 className="font-titulo text-xl font-extrabold">Essa tela não existe.</h1>
      <p className="mt-2 text-sm text-neutro-700">
        O endereço pode ter mudado, ou o link veio de uma versão anterior do sistema.
      </p>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-[var(--altura-controle)] items-center text-base font-semibold text-turquesa-700 underline"
      >
        Voltar ao início
      </Link>
    </Cartao>
  );
}
