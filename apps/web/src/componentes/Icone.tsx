export type NomeDoIcone =
  | 'painel'
  | 'receita'
  | 'tutores'
  | 'pedidos'
  | 'bulario'
  | 'clinicas'
  | 'equipe'
  | 'catalogo'
  | 'relatorios'
  | 'estado'
  | 'sistema'
  | 'mais'
  | 'busca'
  | 'relogio'
  | 'confere'
  | 'atencao'
  | 'alerta'
  | 'dinheiro'
  | 'sair'
  | 'adiante'
  | 'atras'
  | 'recarregar'
  | 'lixeira'
  | 'baixar';

/**
 * O traçado de todos os ícones do sistema.
 *
 * Um só arquivo, e não um pacote: são vinte e poucos desenhos, e uma dependência
 * de ícones traz mil e o peso de todos. Mais importante, traz também o estilo de
 * outra pessoa — e a gota da marca tem traço de 1.8 num quadro de 24, que é o
 * que estes seguem para não destoarem dela.
 *
 * `currentColor` sempre: quem usa decide a cor pela classe de texto, e o ícone
 * acompanha o estado (ativo, desabilitado, dentro de um selo vermelho) sem que
 * ninguém precise passar cor.
 */
const TRACOS: Record<NomeDoIcone, React.ReactNode> = {
  painel: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  receita: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </>
  ),
  tutores: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M17 11.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z" />
      <path d="M16.5 20a4.6 4.6 0 0 1 4-4.5" />
    </>
  ),
  pedidos: (
    <>
      <path d="M3 8.5 12 4l9 4.5-9 4.5z" />
      <path d="M3 8.5V16l9 4.5L21 16V8.5" />
      <path d="M12 13v7.5" />
    </>
  ),
  bulario: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15.5H6.5A2.5 2.5 0 0 0 4 21z" />
      <path d="M8 7.5h7" />
      <path d="M8 11h5" />
    </>
  ),
  clinicas: (
    <>
      <path d="M3 21V8l6-4 6 4v13" />
      <path d="M15 21V11h6v10" />
      <path d="M7 12h2" />
      <path d="M7 16h2" />
    </>
  ),
  equipe: (
    <>
      <circle cx="8.5" cy="8" r="3.2" />
      <path d="M2.5 20a6 6 0 0 1 12 0" />
      <path d="M16.5 4.6a3.4 3.4 0 0 1 0 6.8" />
      <path d="M17.5 14.4a5.6 5.6 0 0 1 4 5.6" />
    </>
  ),
  catalogo: (
    <>
      <path d="M10 3H5a2 2 0 0 0-2 2v5" />
      <path d="M3 14v5a2 2 0 0 0 2 2h5" />
      <path d="M14 21h5a2 2 0 0 0 2-2v-5" />
      <path d="M21 10V5a2 2 0 0 0-2-2h-5" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  relatorios: (
    <>
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M21.5 19h-19" />
    </>
  ),
  estado: (
    <>
      <path d="M3 12h4l2.5-6 5 12L17 12h4" />
    </>
  ),
  sistema: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17" />
      <path d="M3.5 12h17" />
    </>
  ),
  mais: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  busca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  confere: (
    <>
      <path d="M20 6 9 17l-5-5" />
    </>
  ),
  atencao: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5v.01" />
    </>
  ),
  alerta: (
    <>
      <path d="M10.3 3.9 2.4 17.4A1.9 1.9 0 0 0 4 20.3h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z" />
      <path d="M12 9.5v4" />
      <path d="M12 17.2v.01" />
    </>
  ),
  dinheiro: (
    <>
      <path d="M12 4v16" />
      <path d="M15.5 7.5H10a2.5 2.5 0 0 0 0 5h4a2.5 2.5 0 0 1 0 5H8" />
    </>
  ),
  sair: (
    <>
      <path d="M15 17l5-5-5-5" />
      <path d="M20 12H9" />
      <path d="M9 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
    </>
  ),
  adiante: (
    <>
      <path d="m9 18 6-6-6-6" />
    </>
  ),
  atras: (
    <>
      <path d="m15 18-6-6 6-6" />
    </>
  ),
  recarregar: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M18.5 3v3.5H15" />
    </>
  ),
  lixeira: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
    </>
  ),
  baixar: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
};

export type PropsDoIcone = {
  nome: NomeDoIcone;
  /** Lado do quadrado, em px. 17 no corpo de texto, 19 na navegação, 24 em destaque. */
  tamanho?: number;
  className?: string;
};

/**
 * Um ícone.
 *
 * `aria-hidden` sem exceção, e não por descuido: todo lugar que usa um ícone
 * neste sistema tem o texto ao lado, e o leitor de tela que lê os dois lê a
 * mesma coisa duas vezes. Ícone sozinho, sem texto, é o caso que não existe
 * aqui — quando existir, o rótulo vai no elemento que o contém, não no `svg`.
 */
export function Icone({ nome, tamanho = 19, className = '' }: PropsDoIcone) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      // `shrink-0`: dentro de um flex apertado o ícone é a primeira coisa que
      // o navegador amassa, e um ícone amassado vira um borrão sem sentido.
      className={['shrink-0', className].filter(Boolean).join(' ')}
    >
      {TRACOS[nome]}
    </svg>
  );
}
