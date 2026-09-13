import { useCallback } from 'react';
import { exigir, type components } from '@pharmopet/api-client';
import { api } from '@/api/cliente';
import { useConsulta } from '@/api/consulta';
import { Botao } from '@/componentes/Botao';
import { Cartao } from '@/componentes/Cartao';
import { Carregando, Falha } from '@/componentes/Estados';
import { Selo } from '@/componentes/Selo';

type Completa = components['schemas']['FormulacaoDoBularioDto'];

/**
 * Uma formulação aberta, como o guia a escreve.
 *
 * Busca sozinha em vez de receber o resumo da lista: composição, modo de usar e
 * observações são blocos longos, e trazer os de 315 formulações para mostrar
 * uma seria quase um megabyte por busca.
 */
export function Formulacao({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const carregar = useCallback(
    () => exigir(api.GET('/api/v1/bulario/{id}', { params: { path: { id } } })),
    [id],
  );
  const { estado, recarregar } = useConsulta(`formulacao:${id}`, carregar);

  if (estado.situacao === 'carregando') return <Carregando o="a formulação" />;
  if (estado.situacao === 'falha') return <Falha motivo={estado.motivo} aoTentar={recarregar} />;

  return <Conteudo formulacao={estado.dado} aoFechar={aoFechar} />;
}

function Conteudo({ formulacao, aoFechar }: { formulacao: Completa; aoFechar: () => void }) {
  return (
    <Cartao
      titulo={`${formulacao.numero} — ${formulacao.titulo}`}
      acessorio={
        <Botao tom="secundario" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Selo tom="neutro">{formulacao.linhaTerapeutica}</Selo>
          {formulacao.linhaExclusiva ? (
            <Selo tom="sucesso">{formulacao.linhaExclusiva}</Selo>
          ) : null}
          {formulacao.formaFarmaceutica ? (
            <span className="text-sm text-neutro-500">{formulacao.formaFarmaceutica}</span>
          ) : null}
        </div>

        <Bloco titulo="Indicação" texto={formulacao.indicacao} />
        {/* A composição vem com uma linha por item, como no guia. `whitespace-pre-line`
            preserva as quebras sem transformar o texto num parágrafo corrido —
            é uma lista de ativos, e lida como lista. */}
        <Bloco titulo="Composição" texto={formulacao.composicao} pre />
        <Bloco titulo="Modo de usar" texto={formulacao.modoDeUsar} />
        <Bloco titulo="Diferencial" texto={formulacao.diferencial} />
        <Bloco titulo="Observações" texto={formulacao.observacoes} />

        {/*
          A linha que impede o mal-entendido mais caro desta tela: alguém ler a
          composição e achar que basta transcrevê-la para a receita. Parte das
          formulações é dosada em percentual da preparação, e o preço não sai
          dessa conta — ver ADR 0015.
        */}
        <p className="border-t border-neutro-100 pt-4 text-xs text-neutro-500">
          Referência do guia da farmácia. A receita é montada na tela de receita, com o catálogo: as
          doses aqui são as do guia, e não valem como prescrição para este paciente.
        </p>
      </div>
    </Cartao>
  );
}

function Bloco({ titulo, texto, pre }: { titulo: string; texto: string | null; pre?: boolean }) {
  if (!texto) return null;

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-neutro-900">{titulo}</h3>
      <p className={`text-sm text-neutro-700${pre ? ' whitespace-pre-line' : ''}`}>{texto}</p>
    </div>
  );
}
