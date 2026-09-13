import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  type Aroma,
  descreverParaOTutor,
  formatarCnpj,
  formatarCpf,
  formatarTelefone,
  mascararCpf,
  situacaoDaReceita,
  type EstadoDoPedido,
} from '@pharmopet/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ReceitaService } from '../receituario/receita.service';
import type { Ator } from '../receituario/escopo';
import type { DocumentoDaReceita } from './receita.pdf';

/**
 * Tudo que o documento imprime, numa consulta só.
 *
 * É mais do que o `ReceitaDto` carrega — CPF do tutor, endereço e logotipo da
 * clínica — e menos do que as telas precisam. Um include próprio, e não o do
 * receituário, mantém o custo dessa imagem fora de toda listagem de receita.
 */
const PARA_O_DOCUMENTO = {
  paciente: { include: { tutor: true } },
  veterinario: { select: { id: true, nome: true, crmv: true } },
  clinica: true,
  formulacoes: {
    orderBy: { ordem: 'asc' },
    include: {
      forma: { select: { id: true, nome: true } },
      itens: {
        orderBy: { ordem: 'asc' },
        include: {
          insumo: { select: { id: true, codigo: true, descricao: true, listaDeControle: true } },
        },
      },
    },
  },
} satisfies Prisma.ReceitaInclude;

type ReceitaParaDocumento = Prisma.ReceitaGetPayload<{ include: typeof PARA_O_DOCUMENTO }>;

/** O que a página pública do tutor mostra. Ver ADR 0013 para o que fica de fora. */
export type ResumoPublico = {
  numero: number;
  situacao: 'valida' | 'vencida' | 'cancelada' | 'rascunho';
  emitidaEm: string;
  validaAte: string;
  prazoMotivo: string;
  motivoDoCancelamento: string | null;
  clinicaNome: string | null;
  veterinarioNome: string;
  crmv: string;
  tutorNome: string;
  tutorCpf: string | null;
  pacienteNome: string;
  pacienteEspecie: string;
  formulacoes: {
    forma: string;
    quantidade: number;
    frequenciaHoras: number;
    dias: number;
    orientacao: string | null;
    aroma: Aroma | null;
    usoContinuo: boolean;
    valorEmCentavos: number | null;
    itens: { descricao: string; doseMg: number }[];
  }[];
  valorTotalEmCentavos: number;
  pedido: { numero: number; estado: EstadoDoPedido; situacao: string } | null;
};

@Injectable()
export class DocumentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receitas: ReceitaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Para quem tem sessão e já podia ver a receita.
   *
   * O escopo sai de `achar`, e não de uma cópia da regra aqui: o dia em que
   * quem enxerga o quê mudar de novo — já mudou uma vez, na ADR 0012 — uma
   * segunda cópia seria a que ficaria para trás, e ficar para trás neste ponto
   * é entregar receita de outra clínica a quem pediu o PDF.
   */
  async porId(id: string, ator: Ator): Promise<DocumentoDaReceita> {
    await this.receitas.achar(id, ator);

    const receita = await this.prisma.receita.findUnique({
      where: { id },
      include: PARA_O_DOCUMENTO,
    });

    return this.montar(receita);
  }

  /**
   * Para o tutor, que não tem sessão.
   *
   * Sem escopo nenhum: quem tem o token é quem pode ver, e é por isso que ele
   * nasce com 32 bytes de entropia e só existe depois da emissão.
   */
  async porToken(token: string): Promise<DocumentoDaReceita> {
    const receita = await this.prisma.receita.findUnique({
      where: { tokenPublico: token },
      include: PARA_O_DOCUMENTO,
    });

    return this.montar(receita);
  }

  /** O resumo em JSON da mesma receita, com o CPF escondido. */
  async resumoPorToken(token: string): Promise<ResumoPublico> {
    const documento = await this.porToken(token);
    const tutorCpf = documento.tutor.cpf;

    // O pedido vivo desta receita. Sem escopo: quem tem o token é o tutor, e é
    // o pedido dele que está sendo mostrado.
    const receita = await this.prisma.receita.findUnique({
      where: { tokenPublico: token },
      select: {
        pedidos: {
          where: { estado: { not: 'CANCELADO' } },
          select: { numero: true, estado: true },
          take: 1,
        },
      },
    });
    const pedido = receita?.pedidos[0] ?? null;

    return {
      numero: documento.numero,
      situacao: documento.situacao,
      emitidaEm: documento.emitidaEm.toISOString(),
      validaAte: documento.validaAte.toISOString(),
      prazoMotivo: documento.prazoMotivo,
      motivoDoCancelamento: documento.motivoDoCancelamento,
      clinicaNome: documento.clinica?.nome ?? null,
      veterinarioNome: documento.veterinario.nome,
      crmv: documento.veterinario.crmv,
      tutorNome: documento.tutor.nome,
      // `porToken` devolve o CPF formatado inteiro porque o PDF o imprime
      // inteiro — é o documento. A página pública circula por WhatsApp, e aí
      // só as pontas.
      tutorCpf: tutorCpf === null ? null : mascararCpf(tutorCpf),
      pacienteNome: documento.paciente.nome,
      pacienteEspecie: documento.paciente.especie,
      formulacoes: documento.formulacoes.map((f) => ({
        forma: f.forma,
        quantidade: f.quantidade,
        frequenciaHoras: f.frequenciaHoras,
        dias: f.dias,
        orientacao: f.orientacao,
        aroma: f.aroma,
        usoContinuo: f.usoContinuo,
        valorEmCentavos: f.valorEmCentavos,
        // Código e lista de controle ficam no papel, não na página: são para
        // quem manipula.
        itens: f.itens.map((i) => ({ descricao: i.descricao, doseMg: i.doseMg })),
      })),
      valorTotalEmCentavos: documento.valorTotalEmCentavos,
      pedido: pedido
        ? {
            numero: pedido.numero,
            estado: pedido.estado,
            situacao: descreverParaOTutor(pedido.estado),
          }
        : null,
    };
  }

  private async montar(receita: ReceitaParaDocumento | null): Promise<DocumentoDaReceita> {
    if (receita === null) throw new NotFoundException('Receita não encontrada.');

    // Rascunho não tem número, nem validade, nem token — e portanto não tem
    // documento. Quem chegou aqui pediu o PDF de um rascunho pela URL.
    if (receita.emitidaEm === null || receita.numero === null || receita.validaAte === null) {
      throw new NotFoundException('Esta receita ainda não foi emitida.');
    }

    // O mesmo cálculo das telas, e não uma segunda leitura do banco: preço e
    // avisos de uma receita emitida saem dos valores congelados na emissão.
    const formulacoes = await this.receitas.resolverFormulacoes(receita);

    const clinica = receita.clinica;

    return {
      numero: receita.numero,
      situacao: situacaoDaReceita(receita),
      emitidaEm: receita.emitidaEm,
      validaAte: receita.validaAte,
      prazoMotivo: receita.prazoMotivo ?? '',
      motivoDoCancelamento: receita.motivoDoCancelamento,
      observacoes: receita.observacoes,
      veterinario: {
        nome: receita.veterinario.nome,
        // O CRMV congelado na emissão: é o que estava na assinatura.
        crmv: receita.crmvDoVeterinario ?? receita.veterinario.crmv ?? '—',
      },
      clinica: clinica
        ? {
            // Congelados: o cabeçalho não muda quando o cadastro muda.
            nome: receita.clinicaNome ?? clinica.nomeFantasia,
            cnpj: formatarCnpj(receita.clinicaCnpj ?? clinica.cnpj),
            // Endereço e contato não são congelados de propósito: servem para
            // alguém ligar hoje, e o de hoje é o útil.
            endereco: endereco(clinica),
            contatos: contatos(clinica),
            logotipo:
              clinica.logotipo && clinica.logotipoTipo
                ? { conteudo: Buffer.from(clinica.logotipo), tipo: clinica.logotipoTipo }
                : null,
          }
        : null,
      tutor: {
        nome: receita.paciente.tutor.nome,
        cpf: receita.paciente.tutor.cpf === null ? null : formatarCpf(receita.paciente.tutor.cpf),
      },
      paciente: {
        nome: receita.paciente.nome,
        especie: especie(receita.paciente.especie),
        raca: receita.paciente.raca,
        // Congelado: é contra este peso que a dose foi conferida.
        pesoEmGramas: receita.pesoDoPacienteEmGramas ?? receita.paciente.pesoEmGramas ?? 0,
      },
      formulacoes: formulacoes.map((f) => ({
        forma: f.forma,
        quantidade: f.quantidade,
        frequenciaHoras: f.frequenciaHoras,
        dias: f.dias,
        orientacao: f.orientacao,
        aroma: f.aroma,
        usoContinuo: f.usoContinuo,
        valorEmCentavos: f.valorEmCentavos,
        itens: f.itens.map((i) => ({
          codigo: i.codigo,
          descricao: i.descricao,
          doseMg: i.doseMg,
          listaDeControle: i.listaDeControle,
        })),
      })),
      valorTotalEmCentavos: formulacoes.reduce((total, f) => total + (f.valorEmCentavos ?? 0), 0),
      farmacia: this.farmacia(),
    };
  }

  /**
   * A farmácia só entra no documento inteira.
   *
   * Meio bloco — nome sem CNPJ, endereço sem telefone — é pior do que bloco
   * nenhum num papel que identifica quem responde pela manipulação.
   */
  private farmacia(): DocumentoDaReceita['farmacia'] {
    const nome = this.config.get<string>('FARMACIA_NOME');
    const cnpj = this.config.get<string>('FARMACIA_CNPJ');
    const endereco = this.config.get<string>('FARMACIA_ENDERECO');
    const telefone = this.config.get<string>('FARMACIA_TELEFONE');

    if (!nome || !cnpj || !endereco || !telefone) return null;

    return { nome, cnpj, endereco, telefone };
  }
}

/** `CACHORRO` vira `Cachorro`: o enum é do banco, o documento é de quem lê. */
function especie(valor: string): string {
  return valor.charAt(0) + valor.slice(1).toLowerCase();
}

function endereco(clinica: {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}): string | null {
  const rua = [clinica.logradouro, clinica.numero].filter(Boolean).join(', ');
  const local = [clinica.bairro, clinica.cidade, clinica.uf].filter(Boolean).join(' · ');

  return [rua, clinica.complemento, local, clinica.cep].filter(Boolean).join(' — ') || null;
}

function contatos(clinica: {
  telefone: string | null;
  whatsapp: string | null;
  email: string;
}): string | null {
  const telefones = [clinica.telefone, clinica.whatsapp]
    .filter((t): t is string => Boolean(t))
    .map(formatarTelefone);

  return [...telefones, clinica.email].filter(Boolean).join(' · ') || null;
}
