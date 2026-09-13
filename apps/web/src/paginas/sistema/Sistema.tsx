import { MINIMO_AA_TEXTO, atendeAA, contraste, cor, estado } from '@pharmopet/design-tokens';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { CampoDeSenha } from '@/componentes/CampoDeSenha';
import { Cartao } from '@/componentes/Cartao';
import { Selo } from '@/componentes/Selo';

/**
 * Styleguide vivo.
 *
 * Não é um desenho da interface: são os componentes de verdade, com os tokens
 * de verdade. Um quadro estático pode pintar um hex e escrever outro embaixo —
 * foi o que o review de design pegou no artboard. Aqui a amostra é pintada
 * pelo token e a razão de contraste é calculada na hora, então o rótulo não
 * tem como discordar da cor.
 */

/** `sobreEscuro` → "sobre escuro", `marcaSecundaria` → "marca secundária". */
function humanizar(nome: string): string {
  return nome
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace('secundaria', 'secundária');
}

/**
 * Fundo contra o qual cada escala é medida.
 *
 * Medir tudo contra branco seria mais simples e estaria errado: a escala
 * `sobreEscuro` existe justamente para assentar no turquesa 900, e contra
 * branco ela apareceria como "só superfície" — o oposto do seu papel.
 */
const escalas = (Object.entries(cor) as [string, Record<string, string>][]).map(
  ([nome, valores]) => ({
    nome,
    valores,
    fundo: nome === 'sobreEscuro' ? cor.turquesa[900] : cor.neutro[0],
  }),
);

function Amostra({ nome, hex, fundo }: { nome: string; hex: string; fundo: string }) {
  const razao = contraste(hex, fundo);
  const serveComoTexto = atendeAA(hex, fundo);

  return (
    <div className="flex items-center gap-3">
      {/* A amostra é pintada sobre o mesmo fundo em que a razão foi medida —
          senão o número embaixo falaria de uma situação que ninguém vê. */}
      <span
        className="grid size-9 shrink-0 place-items-center rounded-controle border border-neutro-200"
        style={{ backgroundColor: fundo }}
        aria-hidden="true"
      >
        <span className="size-6 rounded-sm" style={{ backgroundColor: hex }} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-neutro-900">{nome}</div>
        <div className="font-mono text-xs text-neutro-500">
          {hex.toUpperCase()} · {razao.toFixed(2)}:1{' '}
          {serveComoTexto ? (
            <span className="text-sucesso-texto">texto</span>
          ) : (
            <span>só superfície</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Sistema() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight">Design system</h1>
        <p className="mt-1 text-sm text-neutro-500">
          Os componentes reais da aplicação. Cada cor é medida contra o fundo em que de fato se
          apoia, com mínimo AA de {MINIMO_AA_TEXTO}:1.
        </p>
      </div>

      <Cartao titulo="Cor">
        <div className="flex flex-col gap-5">
          {escalas.map(({ nome: escala, valores, fundo }) => (
            <div key={escala}>
              <h3 className="mb-2 text-xs font-bold tracking-wide text-neutro-500 uppercase">
                {humanizar(escala)}
                {fundo !== cor.neutro[0] ? (
                  <span className="ml-2 font-mono normal-case">sobre turquesa 900</span>
                ) : null}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(valores).map(([passo, hex]) => (
                  <Amostra
                    key={passo}
                    nome={`${humanizar(escala)} ${humanizar(passo)}`}
                    hex={hex}
                    fundo={fundo}
                  />
                ))}
              </div>
            </div>
          ))}

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-neutro-500 uppercase">
              estado
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(estado).flatMap(([nome, papeis]) =>
                Object.entries(papeis).map(([papel, hex]) => (
                  <Amostra
                    key={`${nome}-${papel}`}
                    nome={`${nome} ${papel}`}
                    hex={hex}
                    // O estado é medido sobre o próprio fundo do estado, que é
                    // onde ele aparece — nunca sobre o branco da página.
                    fundo={papel === 'fundo' ? cor.neutro[0] : papeis.fundo}
                  />
                )),
              )}
            </div>
          </div>
        </div>
      </Cartao>

      <Cartao titulo="Botão">
        <div className="flex flex-wrap items-center gap-3">
          <Botao tom="primario">Nova receita</Botao>
          <Botao tom="secundario">Salvar rascunho</Botao>
          <Botao tom="perigo">Remover medicamento</Botao>
          <Botao tom="primario" disabled>
            Indisponível
          </Botao>
        </div>
        <p className="mt-3 text-xs text-neutro-500">
          Altura mínima de 44px em todos, inclusive nos destrutivos — o alvo pequeno em ação de
          remover foi apontado no review.
        </p>
      </Cartao>

      <Cartao titulo="Selo">
        <div className="flex flex-wrap items-center gap-2">
          <Selo tom="controlado">Controlado</Selo>
          <Selo tom="antimicrobiano">Antimicrobiano</Selo>
          <Selo tom="sucesso">Em manipulação</Selo>
          <Selo tom="marca">Magistral</Selo>
          <Selo tom="neutro">Entregue</Selo>
        </div>
        <p className="mt-3 text-xs text-neutro-500">
          A informação está no texto. A cor é reforço, nunca o único sinal.
        </p>
      </Cartao>

      <Cartao titulo="Campo">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Peso do paciente" placeholder="0,0" ajuda="Em quilos, com uma casa." />
          <Campo
            rotulo="CRMV"
            defaultValue="28.114"
            erro="Informe o estado do conselho, ex.: SP 28.114."
          />
          <CampoDeSenha
            rotulo="Senha"
            defaultValue="uma senha bem longa"
            ajuda="Nasce escondida. O olho mostra, e o rótulo dele diz o que o clique faz."
          />
        </div>
      </Cartao>
    </div>
  );
}
