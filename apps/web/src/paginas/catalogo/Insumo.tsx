import { useCallback, useState } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { mensagemDeErro, useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Campo } from '@/componentes/Campo';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha } from '@/componentes/Estados';

type InsumoAdmin = components['schemas']['InsumoAdminDto'];

/**
 * Micro-real por grama → reais por grama, para o campo.
 *
 * Seis casas porque é a escala em que o custo é guardado: 35.120 micro-reais
 * são R$ 0,03512 por grama, e arredondar para centavo na tela faria a farmácia
 * salvar R$ 0,04 sem perceber que mudou o preço.
 */
function microParaReais(micro: number): string {
  return (micro / 1_000_000).toFixed(6);
}

function reaisParaMicro(texto: string): number | null {
  const valor = Number(texto.replace(',', '.'));
  if (!Number.isFinite(valor) || valor < 0) return null;

  return Math.round(valor * 1_000_000);
}

/** 648 centésimos é 6,48×. */
function centesimosParaFator(centesimos: number): string {
  return (centesimos / 100).toFixed(2);
}

function fatorParaCentesimos(texto: string): number | null {
  const valor = Number(texto.replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) return null;

  return Math.round(valor * 100);
}

/**
 * Um insumo aberto para correção.
 *
 * Busca sozinho em vez de receber o da lista: a lista não traz custo nem
 * markup — eles não trafegam até quem prescreve — e editar um número que a tela
 * não tem seria editar um chute.
 */
export function Insumo({
  id,
  aoFechar,
  aoSalvar,
}: {
  id: string;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const carregar = useCallback(
    () => exigir(api.GET('/api/v1/catalogo/insumos/{id}', { params: { path: { id } } })),
    [id],
  );
  const { estado, recarregar } = useConsulta(`insumo:${id}`, carregar);

  if (estado.situacao === 'carregando') return <Carregando o="o insumo" />;
  if (estado.situacao === 'falha') return <Falha motivo={estado.motivo} aoTentar={recarregar} />;

  return <Formulario insumo={estado.dado} aoFechar={aoFechar} aoSalvar={aoSalvar} />;
}

function Formulario({
  insumo,
  aoFechar,
  aoSalvar,
}: {
  insumo: InsumoAdmin;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [descricao, setDescricao] = useState(insumo.descricao);
  const [custo, setCusto] = useState(microParaReais(insumo.custoPorGramaEmMicro));
  const [referencia, setReferencia] = useState(
    microParaReais(insumo.custoDeReferenciaPorGramaEmMicro),
  );
  const [markup, setMarkup] = useState(centesimosParaFator(insumo.markupEmCentesimos));
  const [estoque, setEstoque] = useState(
    insumo.estoqueEmMiligramas === null ? '' : String(insumo.estoqueEmMiligramas),
  );
  const [controlado, setControlado] = useState(insumo.controlado);
  const [lista, setLista] = useState(insumo.listaDeControle ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const custoEmMicro = reaisParaMicro(custo);
  const referenciaEmMicro = reaisParaMicro(referencia);
  const markupEmCentesimos = fatorParaCentesimos(markup);

  // A mesma regra que a API aplica, dita antes de a pessoa clicar. A API é quem
  // decide — esta cópia só evita a viagem e explica a exigência no lugar onde
  // ela é resolvida.
  const faltaLista = controlado && lista.trim() === '';

  const impedido =
    custoEmMicro === null ||
    referenciaEmMicro === null ||
    markupEmCentesimos === null ||
    faltaLista;

  async function salvar() {
    if (impedido) return;

    setErro(null);
    setSalvando(true);
    try {
      await exigir(
        api.PATCH('/api/v1/catalogo/insumos/{id}', {
          params: { path: { id: insumo.id } },
          body: {
            descricao: descricao.trim(),
            custoPorGramaEmMicro: custoEmMicro,
            custoDeReferenciaPorGramaEmMicro: referenciaEmMicro,
            markupEmCentesimos,
            // Vazio é "não informado", que é diferente de zero: zero afirma
            // falta, e afirmar falta sem saber enche a tela de aviso falso.
            estoqueEmMiligramas: estoque.trim() === '' ? null : Number(estoque),
            controlado,
            listaDeControle: controlado ? lista.trim().toUpperCase() : null,
          },
        }),
      );
      aoSalvar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao
      titulo={`${insumo.codigo} — ${insumo.descricao}`}
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

        <Campo
          rotulo="Descrição"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          ajuda="O código não muda: é por ele que a próxima importação reencontra esta linha."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Custo por grama (R$)"
            inputMode="decimal"
            value={custo}
            onChange={(e) => setCusto(e.target.value)}
            erro={custoEmMicro === null ? 'Informe um valor válido.' : undefined}
          />
          <Campo
            rotulo="Custo de referência por grama (R$)"
            inputMode="decimal"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            ajuda="Piso, para não vender abaixo da reposição quando o custo estiver defasado."
            erro={referenciaEmMicro === null ? 'Informe um valor válido.' : undefined}
          />
          <Campo
            rotulo="Markup (×)"
            inputMode="decimal"
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
            ajuda="6,48 multiplica o custo por 6,48. Zero não é aceito: daria preço zero."
            erro={markupEmCentesimos === null ? 'Precisa ser maior que zero.' : undefined}
          />
          <Campo
            rotulo="Estoque (mg)"
            inputMode="numeric"
            value={estoque}
            onChange={(e) => setEstoque(e.target.value)}
            ajuda="Em branco é “não informado”, que é diferente de zero."
          />
        </div>

        <div className="flex flex-col gap-3 rounded-controle border border-neutro-200 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-neutro-900">
            <input
              type="checkbox"
              checked={controlado}
              onChange={(e) => setControlado(e.target.checked)}
            />
            Controlado
          </label>

          {controlado ? (
            <Campo
              rotulo="Lista de controle"
              placeholder="A1, B1, C1… ou ANTIMICROBIANO"
              value={lista}
              onChange={(e) => setLista(e.target.value)}
              ajuda="É ela que define o prazo de validade da receita: 30 dias nas listas da 344/98, 10 no antimicrobiano."
              erro={
                faltaLista
                  ? 'Sem a lista, a receita ganharia os 180 dias do prazo comum.'
                  : undefined
              }
            />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Botao onClick={salvar} disabled={salvando || impedido}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
          <Botao tom="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </div>
    </Cartao>
  );
}
