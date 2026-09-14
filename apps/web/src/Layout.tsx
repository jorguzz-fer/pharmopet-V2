import { NavLink, Outlet } from 'react-router';
import { Icone, type NomeDoIcone } from '@/componentes/Icone';
import { Marca } from '@/componentes/Marca';
import type { Papel } from '@/sessao/papeis';
import { QuemEsta } from '@/sessao/QuemEsta';
import { useSessao } from '@/sessao/SessaoContexto';

type Aba = {
  para: string;
  rotulo: string;
  icone: NomeDoIcone;
  fim: boolean;
  papeis?: Papel[];
  /** Aparece na barra inferior do celular. Só cinco cabem em 390px. */
  noCelular?: boolean;
};

/**
 * As abas, e quem vê cada uma.
 *
 * São três áreas de produto sobre um login só (ADR 0012): quem prescreve,
 * quem administra a clínica parceira e quem administra a Pharmopet. O que
 * separa as três é o papel, não a URL — a V1 tinha três telas de login e três
 * fluxos paralelos, e manter isso significaria manter três cópias de tudo.
 *
 * `papeis` esconde o que não serve àquele perfil — a farmácia não cadastra
 * tutor, então a aba só ocuparia espaço e levaria a um 403. Esconder é
 * conveniência: a regra mora na API, e o guard de papel recusa quem digitar a
 * URL direto.
 *
 * A divisão entre trabalho e administração é do olho, não do sistema: dez
 * itens numa lista só viram parede, e o que o veterinário abre todo dia não
 * deveria dividir espaço com o que se abre uma vez por mês.
 */
const TRABALHO: Aba[] = [
  { para: '/', rotulo: 'Painel', icone: 'painel', fim: true, noCelular: true },
  { para: '/receitas', rotulo: 'Receitas', icone: 'receita', fim: false, noCelular: true },
  // A clínica lê a clientela dela, mas não a cadastra: quem abre ficha é quem
  // atende. `usePodeCadastrarFicha` é que esconde o botão de cadastro.
  {
    para: '/tutores',
    rotulo: 'Tutores',
    icone: 'tutores',
    fim: false,
    papeis: ['ADMIN', 'VETERINARIO', 'CLINICA'],
    noCelular: true,
  },
  { para: '/pedidos', rotulo: 'Pedidos', icone: 'pedidos', fim: false, noCelular: true },
  // Referência clínica, e portanto para todo mundo: não há custo nem clientela
  // no bulário, e escondê-lo do veterinário não protegeria nada (ADR 0015).
  { para: '/bulario', rotulo: 'Bulário', icone: 'bulario', fim: false, noCelular: true },
];

const ADMINISTRACAO: Aba[] = [
  // Fora do veterinário: ele vê a clínica pela receita, e uma aba que abre
  // vazia para todo autônomo é aba morta.
  {
    para: '/clinicas',
    rotulo: 'Clínicas',
    icone: 'clinicas',
    fim: false,
    papeis: ['ADMIN', 'CLINICA', 'FARMACIA'],
  },
  // A equipe é da administração: é aqui que se cria conta sem abrir o servidor.
  { para: '/equipe', rotulo: 'Equipe', icone: 'equipe', fim: false, papeis: ['ADMIN'] },
  // O catálogo é da administração da farmácia: é lá que se corrige markup,
  // lista de controle e proibição de forma.
  { para: '/catalogo', rotulo: 'Catálogo', icone: 'catalogo', fim: false, papeis: ['ADMIN'] },
  {
    para: '/relatorios',
    rotulo: 'Relatórios',
    icone: 'relatorios',
    fim: false,
    papeis: ['ADMIN', 'FARMACIA'],
  },
  // Era rota sem link: existe desde a fase 2 e só se chegava nela digitando a
  // URL, o que é quase não existir para quem está diagnosticando um deploy.
  { para: '/estado', rotulo: 'Estado', icone: 'estado', fim: false, papeis: ['ADMIN'] },
  { para: '/sistema', rotulo: 'Design system', icone: 'sistema', fim: false, papeis: ['ADMIN'] },
];

function visiveisPara(abas: Aba[], papel: Papel | null): Aba[] {
  return abas.filter((aba) => !aba.papeis || (papel && aba.papeis.includes(papel)));
}

/**
 * Moldura da aplicação.
 *
 * A navegação é lateral no desktop e barra inferior no celular — nunca gaveta.
 * A faixa horizontal anterior prometia rolar e não rolava, e com as dez abas
 * do ADMIN quebrava em duas linhas: o cabeçalho gastava 120px de cromo antes
 * de qualquer conteúdo. A lateral também devolve a largura que as telas de
 * dado precisam, que era o outro custo da faixa.
 *
 * Gaveta continua fora de cogitação pela razão de sempre: o veterinário não
 * deveria precisar abrir um menu para trocar de tela com o animal na mesa.
 */
export function Layout() {
  const { estado } = useSessao();
  const papel = estado.situacao === 'dentro' ? estado.usuario.papel : null;
  const trabalho = visiveisPara(TRABALHO, papel);
  const administracao = visiveisPara(ADMINISTRACAO, papel);
  const noCelular = [...trabalho, ...administracao].filter((aba) => aba.noCelular).slice(0, 5);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Primeiro alvo do Tab: quem navega por teclado pula a navegação
          repetida em toda página em vez de atravessá-la toda vez. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-20 focus:m-2 focus:rounded-controle focus:bg-neutro-0 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Ir para o conteúdo
      </a>

      {/*
        A faixa da marca atravessa a tela inteira, em qualquer largura, e é o
        único lugar onde quem está logado aparece. Já foi tentado pôr o usuário
        no rodapé da lateral e a marca no topo do celular: dava duas cópias do
        mesmo bloco no DOM, uma escondida por CSS — e um leitor de tela que
        ignore o `display:none` (ou um teste, que ignora) lia tudo duas vezes.
      */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutro-200 bg-neutro-0 px-4 py-2.5 sm:px-6">
        <Marca />
        <div className="ml-auto">
          <QuemEsta />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 lg:gap-0">
        {/* Lateral: só do lg para cima, onde há largura de sobra. */}
        <div className="hidden shrink-0 border-r border-neutro-200 bg-neutro-0 lg:sticky lg:top-[57px] lg:flex lg:h-[calc(100dvh-57px)] lg:w-60 lg:flex-col">
          <nav aria-label="Seções" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
            {trabalho.map((aba) => (
              <ItemDaLateral key={aba.para} aba={aba} />
            ))}

            {administracao.length > 0 ? (
              <>
                <div className="mt-4 mb-1 px-3 text-micro font-semibold tracking-wider text-neutro-500 uppercase">
                  Administração
                </div>
                {administracao.map((aba) => (
                  <ItemDaLateral key={aba.para} aba={aba} />
                ))}
              </>
            ) : null}
          </nav>
        </div>

        <main
          id="conteudo"
          // `pb-24` no celular: sem ele a barra inferior cobre a última linha
          // da lista, e quem rola até o fim não descobre que ela existe.
          className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-7 lg:pb-8"
        >
          <Outlet />
        </main>
      </div>

      {/*
        Barra inferior: só até o lg, e só o que se usa todo dia. Nome próprio
        para não haver duas navegações chamadas "Seções" — quem navega por
        marcos precisa distinguir uma da outra.
      */}
      <nav
        aria-label="Seções principais"
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-neutro-200 bg-neutro-0 pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${noCelular.length}, minmax(0, 1fr))` }}
      >
        {noCelular.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para}
            end={aba.fim}
            className={({ isActive }) =>
              [
                'flex min-h-[var(--altura-controle)] flex-col items-center justify-center gap-1 py-2',
                isActive ? 'font-semibold text-turquesa-700' : 'text-neutro-500',
              ].join(' ')
            }
          >
            <Icone nome={aba.icone} tamanho={21} />
            <span className="text-micro">{aba.rotulo}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function ItemDaLateral({ aba }: { aba: Aba }) {
  return (
    <NavLink
      to={aba.para}
      end={aba.fim}
      className={({ isActive }) =>
        [
          'flex min-h-10 items-center gap-3 rounded-controle px-3 text-sm transition-colors',
          isActive
            ? 'bg-turquesa-50 font-semibold text-turquesa-900'
            : 'text-neutro-700 hover:bg-neutro-100',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icone
            nome={aba.icone}
            // Em repouso o ícone é mais claro que o rótulo: dois pesos iguais
            // deixam a lista ruidosa, e o que se lê de fato é o texto.
            className={isActive ? 'text-turquesa-700' : 'text-neutro-500'}
          />
          {aba.rotulo}
        </>
      )}
    </NavLink>
  );
}
