import { NavLink, Outlet } from 'react-router';
import { Marca } from '@/componentes/Marca';
import type { Papel } from '@/sessao/papeis';
import { QuemEsta } from '@/sessao/QuemEsta';
import { useSessao } from '@/sessao/SessaoContexto';

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
 */
const abas: { para: string; rotulo: string; fim: boolean; papeis?: Papel[] }[] = [
  { para: '/', rotulo: 'Receitas', fim: true },
  // A clínica lê a clientela dela, mas não a cadastra: quem abre ficha é quem
  // atende. `usePodeCadastrarFicha` é que esconde o botão de cadastro.
  { para: '/tutores', rotulo: 'Tutores', fim: false, papeis: ['ADMIN', 'VETERINARIO', 'CLINICA'] },
  { para: '/pedidos', rotulo: 'Pedidos', fim: false },
  // Fora do veterinário: ele vê a clínica pela receita, e uma aba que abre
  // vazia para todo autônomo é aba morta.
  { para: '/clinicas', rotulo: 'Clínicas', fim: false, papeis: ['ADMIN', 'CLINICA', 'FARMACIA'] },
  { para: '/sistema', rotulo: 'Design system', fim: false, papeis: ['ADMIN'] },
];

/**
 * Moldura da aplicação.
 *
 * Mobile-first: a navegação é uma faixa que rola no celular e vira uma linha
 * no desktop, sem menu escondido — o veterinário não deveria precisar abrir
 * uma gaveta para trocar de tela com o animal na mesa.
 */
export function Layout() {
  const { estado } = useSessao();
  const papel = estado.situacao === 'dentro' ? estado.usuario.papel : null;
  const visiveis = abas.filter((aba) => !aba.papeis || (papel && aba.papeis.includes(papel)));

  return (
    <div className="min-h-dvh">
      {/* Primeiro alvo do Tab: quem navega por teclado pula a navegação
          repetida em toda página em vez de atravessá-la toda vez. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded-controle focus:bg-neutro-0 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Ir para o conteúdo
      </a>

      <header className="border-b border-neutro-200 bg-neutro-0">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Marca />
          <nav aria-label="Seções" className="flex gap-1">
            {visiveis.map((aba) => (
              <NavLink
                key={aba.para}
                to={aba.para}
                end={aba.fim}
                className={({ isActive }) =>
                  [
                    'flex min-h-[var(--altura-controle)] items-center rounded-controle px-3 text-sm',
                    isActive
                      ? 'bg-turquesa-50 font-semibold text-turquesa-900'
                      : 'text-neutro-500 hover:bg-neutro-100',
                  ].join(' ')
                }
              >
                {aba.rotulo}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto">
            <QuemEsta />
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
