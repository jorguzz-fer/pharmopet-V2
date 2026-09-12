import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Especie, Insumo, Prisma } from '@prisma/client';
import {
  conferirDose,
  descreverConferencia,
  precificar,
  type CondicoesComerciais,
  type FaixaTerapeutica,
  type InsumoParaCalculo,
  type ItemDaFormula,
  type PrecificacaoCalculada,
} from '@pharmopet/shared';
import { PrismaService } from '../prisma/prisma.service';

type InsumoComRestricoes = Insumo & {
  restricoes: { motivo: string; forma: { id: string; nome: string } }[];
};

export type ItemPedido = { insumoId: string; doseMg: number; quantidade: number };
export type PacientePedido = { especie: Especie; pesoEmGramas: number };

export type AvisoDoOrcamento = {
  tipo: 'sem-estoque' | 'controlado' | 'antimicrobiano' | 'fora-da-faixa' | 'sem-referencia';
  insumoId: string | null;
  texto: string;
};

export type OrcamentoCompleto = {
  calculo: PrecificacaoCalculada;
  forma: string;
  avisos: AvisoDoOrcamento[];
  impedimentos: { insumoId: string | null; texto: string }[];
  /** Do código da farmácia para o id, que é o que a tela usa para apontar a linha. */
  idPorCodigo: Map<string, string>;
};

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Insumos ativos, opcionalmente filtrados por trecho do nome ou do código. */
  async listarInsumos(busca?: string): Promise<InsumoComRestricoes[]> {
    const termo = busca?.trim();

    const where: Prisma.InsumoWhereInput = {
      desativadoEm: null,
      ...(termo
        ? {
            OR: [
              { descricao: { contains: termo, mode: 'insensitive' } },
              { codigo: { contains: termo, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.insumo.findMany({
      where,
      include: { restricoes: { include: { forma: { select: { id: true, nome: true } } } } },
      orderBy: { descricao: 'asc' },
      // Teto de segurança: a busca alimenta um campo de autocompletar, e uma
      // lista de mil linhas não ajuda ninguém a escolher um insumo.
      take: 50,
    });
  }

  async listarFormas(): Promise<{ id: string; nome: string }[]> {
    return this.prisma.formaFarmaceutica.findMany({
      where: { desativadaEm: null },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });
  }

  /**
   * As condições comerciais da instalação.
   *
   * Cria a linha zerada na primeira leitura: sem isso, uma instalação nova
   * responderia 404 ao precificar, e o erro apareceria como "sem orçamento" em
   * vez de "ninguém configurou ainda".
   */
  async condicoes(): Promise<CondicoesComerciais> {
    const linha = await this.prisma.condicoesComerciais.upsert({
      where: { id: 'padrao' },
      update: {},
      create: { id: 'padrao' },
    });

    return {
      taxaDeManipulacaoEmCentavos: linha.taxaDeManipulacaoEmCentavos,
      custoDeEmbalagensEmCentavos: linha.custoDeEmbalagensEmCentavos,
      descontoEmPontosBase: linha.descontoEmPontosBase,
      adicionalDeEntregaEmCentavos: linha.adicionalDeEntregaEmCentavos,
      adicionalDeBiscoitoEmCentavos: linha.adicionalDeBiscoitoEmCentavos,
    };
  }

  async definirCondicoes(novas: CondicoesComerciais): Promise<CondicoesComerciais> {
    await this.prisma.condicoesComerciais.upsert({
      where: { id: 'padrao' },
      update: novas,
      create: { id: 'padrao', ...novas },
    });

    return novas;
  }

  /**
   * Monta o orçamento de uma formulação.
   *
   * Carrega o que o cálculo precisa e chama a função pura. A separação é o que
   * permite testar a aritmética de preço sem banco, e o que vai permitir que as
   * condições venham de uma clínica quando houver cadastro delas.
   */
  async orcar(
    itensPedidos: readonly ItemPedido[],
    formaId: string,
    paciente?: PacientePedido,
  ): Promise<OrcamentoCompleto> {
    const forma = await this.prisma.formaFarmaceutica.findUnique({ where: { id: formaId } });
    if (!forma || forma.desativadaEm !== null) {
      throw new NotFoundException('Forma farmacêutica não encontrada.');
    }

    const ids = [...new Set(itensPedidos.map((i) => i.insumoId))];
    if (ids.length !== itensPedidos.length) {
      throw new BadRequestException('O mesmo insumo aparece duas vezes na fórmula.');
    }

    const insumos = await this.prisma.insumo.findMany({
      where: { id: { in: ids }, desativadoEm: null },
      include: {
        restricoes: { include: { forma: { select: { id: true, nome: true } } } },
        faixas: true,
      },
    });

    const porId = new Map(insumos.map((i) => [i.id, i]));
    const faltando = ids.filter((id) => !porId.has(id));
    if (faltando.length > 0) {
      throw new NotFoundException('Um dos insumos da fórmula não existe ou foi desativado.');
    }

    const itens: ItemDaFormula[] = [];

    for (const pedido of itensPedidos) {
      const registro = porId.get(pedido.insumoId)!;

      itens.push({
        insumo: paraCalculo(registro),
        // A dose chega em miligrama com até três casas — o schema garante —,
        // então multiplicar por mil dá um inteiro exato.
        dosePorUnidadeEmMicrogramas: Math.round(pedido.doseMg * 1000),
        quantidade: pedido.quantidade,
      });
    }

    const calculo = precificar({ itens, forma: forma.nome, condicoes: await this.condicoes() });

    // O motor identifica o insumo pelo código da farmácia, que é o que a equipe
    // usa; a tela precisa do id para apontar a linha. A tradução é aqui.
    const idPorCodigo = new Map(insumos.map((i) => [i.codigo, i.id]));

    const avisos: AvisoDoOrcamento[] = calculo.avisos.map((a) => ({
      tipo: a.tipo,
      insumoId: idPorCodigo.get(a.codigo) ?? null,
      texto: a.texto,
    }));

    if (paciente) {
      for (const pedido of itensPedidos) {
        const registro = porId.get(pedido.insumoId)!;
        const conferencia = conferirDose(
          registro.faixas.map(paraFaixa),
          paciente,
          Math.round(pedido.doseMg * 1000),
        );

        const frase = descreverConferencia(conferencia, registro.descricao);
        if (frase === null) continue;

        avisos.push({
          tipo: conferencia.situacao === 'sem-referencia' ? 'sem-referencia' : 'fora-da-faixa',
          insumoId: registro.id,
          texto: frase,
        });
      }
    }

    return {
      calculo,
      forma: forma.nome,
      avisos,
      impedimentos: calculo.impedimentos.map((i) => ({
        insumoId: i.codigo ? (idPorCodigo.get(i.codigo) ?? null) : null,
        texto: i.texto,
      })),
      idPorCodigo,
    };
  }
}

function paraCalculo(registro: InsumoComRestricoes): InsumoParaCalculo {
  return {
    codigo: registro.codigo,
    descricao: registro.descricao,
    custoPorGramaEmMicro: registro.custoPorGramaEmMicro,
    custoDeReferenciaPorGramaEmMicro: registro.custoDeReferenciaPorGramaEmMicro,
    markupEmCentesimos: registro.markupEmCentesimos,
    estoqueEmMiligramas: registro.estoqueEmMiligramas,
    controlado: registro.controlado,
    listaDeControle: registro.listaDeControle,
    formasProibidas: registro.restricoes.map((r) => r.forma.nome),
  };
}

function paraFaixa(linha: {
  especie: Especie;
  pesoMinimoEmGramas: number | null;
  pesoMaximoEmGramas: number | null;
  doseMinimaEmMicrogramasPorKg: number;
  doseMaximaEmMicrogramasPorKg: number;
  duracaoMaximaEmDias: number | null;
}): FaixaTerapeutica {
  return {
    especie: linha.especie,
    pesoMinimoEmGramas: linha.pesoMinimoEmGramas,
    pesoMaximoEmGramas: linha.pesoMaximoEmGramas,
    doseMinimaEmMicrogramasPorKg: linha.doseMinimaEmMicrogramasPorKg,
    doseMaximaEmMicrogramasPorKg: linha.doseMaximaEmMicrogramasPorKg,
    duracaoMaximaEmDias: linha.duracaoMaximaEmDias,
  };
}
