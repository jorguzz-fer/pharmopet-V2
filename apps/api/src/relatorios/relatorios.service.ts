import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { periodoDoMes } from './periodo';

/** Uma linha de quebra: quem, quantas, quanto. */
export type Linha = {
  id: string | null;
  nome: string;
  detalhe: string | null;
  receitas: number;
  valorEmCentavos: number;
};

export type RelatorioDePrescricoes = {
  mes: string;
  receitas: number;
  valorEmCentavos: number;
  porVeterinario: Linha[];
  porClinica: Linha[];
};

/**
 * O que foi prescrito num mês (ADR 0017).
 *
 * **Valor prescrito, nunca faturamento.** Soma `formulacao.valorEmCentavos`
 * de receitas emitidas; não existe meio de pagamento, então não existe número
 * que signifique "recebido". A v1 chamava de faturamento a soma de todo
 * orçamento criado, pago ou não, e o relatório dela dizia que tinha entrado
 * dinheiro que talvez nunca entrasse.
 *
 * Só receita **emitida** entra. Rascunho tem preço de cotação, e cotação muda
 * — contá-lo faria o número do relatório mudar sozinho entre duas aberturas.
 *
 * Sem escopo por papel: a rota é de ADMIN e FARMACIA, que veem tudo por
 * definição (ADR 0011). Se um dia o relatório abrir para a clínica, o filtro
 * tem de vir de `escopoDeReceita`, como no painel — nunca de um `where`
 * escrito aqui.
 */
@Injectable()
export class RelatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  async prescricoes(mes?: string): Promise<RelatorioDePrescricoes> {
    const periodo = periodoDoMes(mes);

    const receitas = await this.prisma.receita.findMany({
      where: {
        estado: 'EMITIDA',
        emitidaEm: { gte: periodo.inicio, lt: periodo.fim },
      },
      select: {
        id: true,
        clinicaId: true,
        // Congelado na emissão: é o nome que estava no documento. Ler o
        // cadastro de hoje faria o relatório de um mês fechado mudar quando
        // alguém renomeasse a clínica.
        clinicaNome: true,
        veterinarioId: true,
        crmvDoVeterinario: true,
        veterinario: { select: { nome: true, crmv: true } },
        formulacoes: { select: { valorEmCentavos: true } },
      },
    });

    const porVeterinario = new Map<string, Linha>();
    const porClinica = new Map<string, Linha>();
    let total = 0;

    for (const receita of receitas) {
      const valor = receita.formulacoes.reduce((soma, f) => soma + (f.valorEmCentavos ?? 0), 0);
      total += valor;

      somar(porVeterinario, receita.veterinarioId, {
        id: receita.veterinarioId,
        nome: receita.veterinario.nome,
        // O CRMV congelado na receita vem antes do cadastro: é o que assinou.
        detalhe: receita.crmvDoVeterinario ?? receita.veterinario.crmv,
        receitas: 0,
        valorEmCentavos: 0,
      }).valorEmCentavos += valor;

      // Receita sem clínica é do veterinário autônomo, e vira uma linha
      // própria em vez de sumir: a soma das clínicas tem de fechar com o
      // total, senão o relatório não presta para acertar conta.
      const chave = receita.clinicaId ?? SEM_CLINICA;
      somar(porClinica, chave, {
        id: receita.clinicaId,
        nome: receita.clinicaNome ?? 'Sem clínica (atendimento próprio)',
        detalhe: null,
        receitas: 0,
        valorEmCentavos: 0,
      }).valorEmCentavos += valor;
    }

    return {
      mes: periodo.rotulo,
      receitas: receitas.length,
      valorEmCentavos: total,
      porVeterinario: ordenadas(porVeterinario),
      porClinica: ordenadas(porClinica),
    };
  }
}

const SEM_CLINICA = 'sem-clinica';

/** Acha ou cria a linha, já contando a receita. Devolve-a para somar o valor. */
function somar(mapa: Map<string, Linha>, chave: string, nova: Linha): Linha {
  const linha = mapa.get(chave) ?? nova;
  linha.receitas += 1;
  mapa.set(chave, linha);

  return linha;
}

/**
 * Do maior valor para o menor, e o nome desempata.
 *
 * O desempate não é capricho: sem ele, duas linhas de mesmo valor trocariam
 * de lugar entre duas aberturas do relatório, e quem confere a mesma tela
 * duas vezes acharia que algo mudou.
 */
function ordenadas(mapa: Map<string, Linha>): Linha[] {
  return [...mapa.values()].sort(
    (a, b) => b.valorEmCentavos - a.valorEmCentavos || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}
