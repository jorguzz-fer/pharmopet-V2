import PDFDocument from 'pdfkit';
import {
  descreverSituacao,
  formatarPeso,
  formatarReais,
  type SituacaoDaReceita,
} from '@pharmopet/shared';

/**
 * O que o documento precisa saber. Tudo já resolvido e congelado: esta função
 * desenha, não decide — nenhuma regra de domínio mora aqui.
 */
export type DocumentoDaReceita = {
  numero: number;
  situacao: SituacaoDaReceita;
  emitidaEm: Date;
  validaAte: Date;
  prazoMotivo: string;
  motivoDoCancelamento: string | null;
  observacoes: string | null;
  veterinario: { nome: string; crmv: string };
  /** Nula quando quem prescreve atende por conta própria. */
  clinica: Cabecalho | null;
  tutor: { nome: string; cpf: string | null };
  paciente: { nome: string; especie: string; raca: string | null; pesoEmGramas: number };
  formulacoes: FormulacaoImpressa[];
  valorTotalEmCentavos: number;
  /**
   * Quem manipula. Vai no rodapé, e não no cabeçalho: o cabeçalho é de quem
   * prescreveu (ADR 0012), e quem manipula é a outra ponta.
   *
   * Nula quando a instalação ainda não foi configurada — o documento sai sem o
   * bloco em vez de sair com endereço inventado.
   */
  farmacia: { nome: string; cnpj: string; endereco: string; telefone: string } | null;
};

type Cabecalho = {
  nome: string;
  cnpj: string;
  endereco: string | null;
  contatos: string | null;
  logotipo: { conteudo: Buffer; tipo: string } | null;
};

export type FormulacaoImpressa = {
  forma: string;
  quantidade: number;
  frequenciaHoras: number;
  dias: number;
  orientacao: string | null;
  valorEmCentavos: number | null;
  itens: { codigo: string; descricao: string; doseMg: number; listaDeControle: string | null }[];
};

const MARGEM = 48;
const TINTA = '#111827';
const APAGADO = '#6b7280';
const LINHA = '#e5e7eb';
const MARCA = '#0f766e';
const ALERTA = '#b91c1c';

/**
 * `pdfkit` não desenha SVG. Uma clínica pode ter subido um, e o cabeçalho
 * precisa sair mesmo assim — em texto, que é o que já acontece para quem não
 * tem logotipo nenhum.
 */
const TIPOS_DESENHAVEIS = ['image/png', 'image/jpeg'];

/** Desenha a receita e devolve o PDF pronto. */
export function montarPdfDaReceita(receita: DocumentoDaReceita): Promise<Buffer> {
  return new Promise((resolver, recusar) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM },
      info: {
        Title: `Receita ${numeroLegivel(receita.numero)}`,
        Author: receita.clinica?.nome ?? receita.veterinario.nome,
      },
    });

    const pedacos: Buffer[] = [];
    doc.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
    doc.on('end', () => resolver(Buffer.concat(pedacos)));
    doc.on('error', recusar);

    const largura = doc.page.width - MARGEM * 2;

    cabecalho(doc, receita, largura);
    titulo(doc, receita, largura);
    if (receita.situacao !== 'valida') tarja(doc, receita, largura);
    quemEQuem(doc, receita, largura);
    formulacoes(doc, receita, largura);
    observacoes(doc, receita);
    rodape(doc, receita, largura);

    doc.end();
  });
}

function cabecalho(doc: PDFKit.PDFDocument, receita: DocumentoDaReceita, largura: number): void {
  const topo = doc.y;
  const logotipo = desenhavel(receita.clinica?.logotipo ?? null);

  if (logotipo) {
    try {
      doc.image(logotipo, MARGEM, topo, { fit: [72, 72] });
    } catch {
      // Arquivo corrompido ou tipo que o pdfkit recusa. O cabeçalho em texto
      // já diz de quem é a receita; parar a emissão por causa da marca seria
      // desproporcional.
    }
  }

  const x = logotipo ? MARGEM + 88 : MARGEM;
  const util = logotipo ? largura - 88 : largura;

  if (receita.clinica) {
    doc.font('Helvetica-Bold').fontSize(15).fillColor(TINTA);
    doc.text(receita.clinica.nome, x, topo, { width: util });

    doc.font('Helvetica').fontSize(8.5).fillColor(APAGADO);
    doc.text(`CNPJ ${receita.clinica.cnpj}`, x, doc.y + 1, { width: util });
    if (receita.clinica.endereco) doc.text(receita.clinica.endereco, x, doc.y, { width: util });
    if (receita.clinica.contatos) doc.text(receita.clinica.contatos, x, doc.y, { width: util });
  } else {
    // Sem clínica, o documento sai no nome de quem prescreve.
    doc.font('Helvetica-Bold').fontSize(15).fillColor(TINTA);
    doc.text(receita.veterinario.nome, x, topo, { width: util });

    doc.font('Helvetica').fontSize(8.5).fillColor(APAGADO);
    doc.text(`CRMV ${receita.veterinario.crmv}`, x, doc.y + 1, { width: util });
  }

  doc.y = Math.max(doc.y, topo + (logotipo ? 72 : 0)) + 10;
  doc.rect(MARGEM, doc.y, largura, 2).fill(MARCA);
  doc.y += 14;
}

function titulo(doc: PDFKit.PDFDocument, receita: DocumentoDaReceita, largura: number): void {
  doc.font('Helvetica-Bold').fontSize(13).fillColor(TINTA);
  doc.text('RECEITUÁRIO VETERINÁRIO', MARGEM, doc.y, { width: largura, align: 'center' });

  doc.font('Helvetica').fontSize(9).fillColor(APAGADO);
  doc.text(
    `Nº ${numeroLegivel(receita.numero)} · emitida em ${data(receita.emitidaEm)}`,
    MARGEM,
    doc.y + 2,
    { width: largura, align: 'center' },
  );
  doc.y += 14;
}

/**
 * A tarja de cancelada ou vencida.
 *
 * No topo e não no rodapé: quem recebe esta folha no balcão precisa descobrir
 * que ela não vale antes de ler a fórmula, não depois.
 */
function tarja(doc: PDFKit.PDFDocument, receita: DocumentoDaReceita, largura: number): void {
  const texto = descreverSituacao(receita.situacao) ?? 'Esta receita não está válida.';
  const motivo = receita.motivoDoCancelamento ? ` Motivo: ${receita.motivoDoCancelamento}` : '';
  const altura = doc.heightOfString(texto + motivo, { width: largura - 20 }) + 14;

  doc.rect(MARGEM, doc.y, largura, altura).fill('#fef2f2');
  doc.font('Helvetica-Bold').fontSize(10).fillColor(ALERTA);
  doc.text(texto + motivo, MARGEM + 10, doc.y + 7, { width: largura - 20 });

  doc.y += 12;
}

function quemEQuem(doc: PDFKit.PDFDocument, receita: DocumentoDaReceita, largura: number): void {
  const coluna = largura / 2 - 12;
  const direita = MARGEM + coluna + 24;

  regua(doc, largura);
  const topo = doc.y;

  bloco(doc, 'TUTOR', MARGEM, topo, coluna, [
    { texto: receita.tutor.nome, forte: true },
    { texto: receita.tutor.cpf ? `CPF ${receita.tutor.cpf}` : 'CPF não informado' },
  ]);
  const fimEsquerda = doc.y;

  const paciente = receita.paciente;
  bloco(doc, 'PACIENTE', direita, topo, coluna, [
    { texto: paciente.nome, forte: true },
    { texto: [paciente.especie, paciente.raca].filter(Boolean).join(' · ') },
    { texto: `${formatarPeso(paciente.pesoEmGramas)} na data da emissão` },
  ]);

  doc.y = Math.max(fimEsquerda, doc.y) + 10;

  regua(doc, largura);
  bloco(doc, 'VETERINÁRIO RESPONSÁVEL', MARGEM, doc.y, largura, [
    { texto: `${receita.veterinario.nome} — CRMV ${receita.veterinario.crmv}`, forte: true },
  ]);
  doc.y += 10;
}

function formulacoes(doc: PDFKit.PDFDocument, receita: DocumentoDaReceita, largura: number): void {
  regua(doc, largura);
  rotulo(doc, `PRESCRIÇÃO (${receita.formulacoes.length})`, MARGEM, doc.y, largura);
  doc.y += 4;

  receita.formulacoes.forEach((formulacao, indice) => {
    // Uma fórmula não deve ficar partida entre duas folhas: o balconista lê
    // dose numa página e quantidade na outra, e é assim que se manipula errado.
    if (doc.y > doc.page.height - 200) doc.addPage();

    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TINTA);
    doc.text(`${indice + 1}. ${formulacao.forma}`, MARGEM, doc.y + 4, { width: largura });

    for (const item of formulacao.itens) {
      doc.font('Helvetica').fontSize(9.5).fillColor(TINTA);
      doc.text(`${item.descricao} — ${dose(item.doseMg)} por dose`, MARGEM + 12, doc.y + 2, {
        width: largura - 12,
      });

      const marcas = [
        `cód. ${item.codigo}`,
        item.listaDeControle ? `lista ${item.listaDeControle}` : null,
      ].filter(Boolean);
      doc.font('Helvetica').fontSize(8).fillColor(APAGADO);
      doc.text(marcas.join(' · '), MARGEM + 12, doc.y, { width: largura - 12 });
    }

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(MARCA);
    doc.text(posologia(formulacao), MARGEM + 12, doc.y + 4, { width: largura - 12 });

    if (formulacao.orientacao) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(APAGADO);
      doc.text(formulacao.orientacao, MARGEM + 12, doc.y + 2, { width: largura - 12 });
    }

    doc.y += 8;
  });

  regua(doc, largura);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(TINTA);
  doc.text(`Total: ${formatarReais(receita.valorTotalEmCentavos)}`, MARGEM, doc.y + 2, {
    width: largura,
    align: 'right',
  });
  doc.y += 8;
}

function observacoes(doc: PDFKit.PDFDocument, receita: DocumentoDaReceita): void {
  if (!receita.observacoes) return;

  const largura = doc.page.width - MARGEM * 2;
  regua(doc, largura);
  rotulo(doc, 'OBSERVAÇÕES', MARGEM, doc.y, largura);

  doc.font('Helvetica').fontSize(9.5).fillColor(TINTA);
  doc.text(receita.observacoes, MARGEM, doc.y + 4, { width: largura });
  doc.y += 8;
}

function rodape(doc: PDFKit.PDFDocument, receita: DocumentoDaReceita, largura: number): void {
  // Assinatura e validade andam juntas e não se separam da folha.
  if (doc.y > doc.page.height - 160) doc.addPage();

  const linha = doc.y + 46;
  const comprimento = 240;
  const inicio = (doc.page.width - comprimento) / 2;

  doc
    .moveTo(inicio, linha)
    .lineTo(inicio + comprimento, linha)
    .stroke('#9ca3af');

  doc.font('Helvetica-Bold').fontSize(10).fillColor(TINTA);
  doc.text(receita.veterinario.nome, inicio, linha + 6, {
    width: comprimento,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(9).fillColor(APAGADO);
  doc.text(`CRMV ${receita.veterinario.crmv}`, inicio, doc.y, {
    width: comprimento,
    align: 'center',
  });

  // A validade de verdade, calculada na emissão a partir da lista de controle
  // do que foi prescrito. É o que a farmácia lê para decidir se manipula.
  const valida = receita.situacao === 'valida';
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(valida ? TINTA : ALERTA);
  doc.text(validade(receita), MARGEM, doc.y + 18, { width: largura, align: 'center' });

  doc.font('Helvetica').fontSize(8).fillColor(APAGADO);
  doc.text(receita.prazoMotivo, MARGEM, doc.y + 1, { width: largura, align: 'center' });

  farmacia(doc, receita, largura);
}

/** Quem manipula, no pé da folha. Pedido do cliente na reunião de 11/09. */
function farmacia(doc: PDFKit.PDFDocument, receita: DocumentoDaReceita, largura: number): void {
  if (!receita.farmacia) return;

  doc.y += 14;
  doc.rect(MARGEM, doc.y, largura, 0.7).fill(LINHA);

  doc.font('Helvetica-Bold').fontSize(8).fillColor(APAGADO);
  doc.text(receita.farmacia.nome, MARGEM, doc.y + 6, { width: largura, align: 'center' });

  doc.font('Helvetica').fontSize(7.5).fillColor(APAGADO);
  doc.text(receita.farmacia.endereco, MARGEM, doc.y + 1, { width: largura, align: 'center' });
  doc.text(`CNPJ ${receita.farmacia.cnpj} · ${receita.farmacia.telefone}`, MARGEM, doc.y + 1, {
    width: largura,
    align: 'center',
  });
}

function bloco(
  doc: PDFKit.PDFDocument,
  titulo: string,
  x: number,
  y: number,
  largura: number,
  linhas: { texto: string; forte?: boolean }[],
): void {
  rotulo(doc, titulo, x, y, largura);

  for (const linha of linhas) {
    if (!linha.texto) continue;

    doc.font(linha.forte ? 'Helvetica-Bold' : 'Helvetica');
    doc.fontSize(linha.forte ? 10 : 9).fillColor(linha.forte ? TINTA : APAGADO);
    doc.text(linha.texto, x, doc.y + 2, { width: largura });
  }
}

function rotulo(
  doc: PDFKit.PDFDocument,
  texto: string,
  x: number,
  y: number,
  largura: number,
): void {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MARCA);
  doc.text(texto, x, y + 6, { width: largura, characterSpacing: 0.6 });
}

function regua(doc: PDFKit.PDFDocument, largura: number): void {
  doc.rect(MARGEM, doc.y, largura, 0.7).fill(LINHA);
}

/**
 * A linha de validade, no tempo verbal certo.
 *
 * "Válida até" numa receita cancelada afirma o contrário da tarja do topo, e o
 * rodapé é onde o balconista confere. Duas frases discordando no mesmo papel
 * fazem alguém manipular o que não devia.
 */
export function validade(receita: Pick<DocumentoDaReceita, 'situacao' | 'validaAte'>): string {
  const quando = data(receita.validaAte);

  switch (receita.situacao) {
    case 'cancelada':
      return 'Cancelada — não vale como receita.';
    case 'vencida':
      return `Venceu em ${quando}.`;
    default:
      return `Válida até ${quando}`;
  }
}

/** `7` vira `Nº 0007`: número de receita se lê e se dita por telefone. */
function numeroLegivel(numero: number): string {
  return String(numero).padStart(4, '0');
}

function data(quando: Date): string {
  return quando.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

/** Miligrama abaixo de mil, grama acima: ninguém prescreve "1500 mg". */
export function dose(mg: number): string {
  return mg >= 1000 ? `${arredondar(mg / 1000)} g` : `${arredondar(mg)} mg`;
}

function arredondar(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

export function posologia(formulacao: FormulacaoImpressa): string {
  const vezes = 24 / formulacao.frequenciaHoras;
  const porDia = vezes === 1 ? '1 vez ao dia' : `${vezes} vezes ao dia`;
  const dias = formulacao.dias === 1 ? '1 dia' : `${formulacao.dias} dias`;

  return `Dar ${porDia}, por ${dias}. Aviar ${formulacao.quantidade} ${unidade(formulacao)}.`;
}

function unidade(formulacao: FormulacaoImpressa): string {
  return formulacao.quantidade === 1 ? 'unidade' : 'unidades';
}

/** O logotipo só quando o `pdfkit` sabe desenhá-lo. */
function desenhavel(logotipo: Cabecalho['logotipo']): Buffer | null {
  if (!logotipo) return null;

  return TIPOS_DESENHAVEIS.includes(logotipo.tipo) ? logotipo.conteudo : null;
}
