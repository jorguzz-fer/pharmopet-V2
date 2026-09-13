"""
Lê os guias magistrais (.docx) e produz o export estruturado do bulário.

Roda fora do repositório de propósito: é uma conversão de uma vez, do formato
que a farmácia usa para escrever (Word) para o formato que o sistema importa.
O que fica versionado é o resultado, que dá para revisar linha a linha.
"""
import docx, os, re, json, glob, sys, unicodedata
from collections import Counter

BASES = sys.argv[1]
SAIDA = sys.argv[2]

CAMPOS = ['Forma farmacêutica', 'Indicação', 'Diferencial', 'Fórmula magistral',
          'Modo de usar', 'Observações', 'Linha exclusiva']
TITULO = re.compile(r'^(\d+(?:\.\d+)*)\s+(.+)$')
ROTULO = re.compile(r'^(' + '|'.join(map(re.escape, CAMPOS)) + r')\s*:\s*(.*)$')

# Veículo, base ou forma preenchendo o volume. Não é ativo, e não tem dose.
VEICULO = re.compile(
    r'excipiente|ve[ií]culo|base\b|petisco|pasta|xampu|gel|sach[êe]|c[áa]psula|'
    r'suspens[ãa]o|solu[çc][ãa]o|creme|pomada|spray|shampoo|q\.s\.p',
    re.I)

def campos_de(bloco):
    out, atual = {}, None
    for linha in bloco.split('\n'):
        m = ROTULO.match(linha.strip())
        if m:
            atual = m.group(1)
            out[atual] = m.group(2).strip()
        elif atual:
            out[atual] = (out[atual] + '\n' + linha.strip()).strip()
    return out

def itens_da_formula(texto):
    """As linhas com marcador. Separa ativo de veículo, e lê a dose quando há."""
    itens = []
    for linha in (texto or '').split('\n'):
        l = linha.strip(' •\t-')
        if not l or ROTULO.match(l):
            continue
        ehVeiculo = bool(VEICULO.search(l)) and not re.search(r'\d\s*(mg|mcg|µg|UI)\b', l, re.I)
        itens.append({'texto': l, 'veiculo': ehVeiculo})
    return itens

def especies_de(*textos):
    junto = ' '.join(t or '' for t in textos).lower()
    junto = unicodedata.normalize('NFKD', junto).encode('ascii', 'ignore').decode()
    saida = []
    if re.search(r'\bcaes\b|\bcao\b|canin', junto): saida.append('CANINO')
    if re.search(r'\bgatos?\b|felin', junto): saida.append('FELINO')
    return saida

formulas, pulados = [], []
arquivos = sorted(glob.glob(os.path.join(BASES, '*.docx')))

for caminho in arquivos:
    nome = os.path.basename(caminho)
    linha_terapeutica = re.sub(r'.*Linha\s+', '', nome.replace('.docx', '')).strip()
    if 'Linha' not in nome:  # "3. Linha Antimicrobiana Oral.docx" e afins
        linha_terapeutica = re.sub(r'^[\d.\s]+', '', nome.replace('.docx', '')).strip()

    textos = [x.text for x in docx.Document(caminho).paragraphs if x.text.strip()]
    i = 0
    while i < len(textos):
        m = TITULO.match(textos[i].strip())
        if m and i + 1 < len(textos):
            c = campos_de(textos[i + 1])
            if c:
                titulo = m.group(2).strip()
                formulas.append({
                    'numero': m.group(1),
                    'linhaTerapeutica': linha_terapeutica,
                    'titulo': titulo,
                    'formaFarmaceutica': c.get('Forma farmacêutica'),
                    'indicacao': c.get('Indicação'),
                    'diferencial': c.get('Diferencial'),
                    'composicao': c.get('Fórmula magistral'),
                    'modoDeUsar': c.get('Modo de usar'),
                    'observacoes': c.get('Observações'),
                    'linhaExclusiva': c.get('Linha exclusiva'),
                    'especies': especies_de(titulo, c.get('Indicação'), c.get('Modo de usar')),
                    'itens': itens_da_formula(c.get('Fórmula magistral')),
                })
                i += 2
                continue
        if m:
            pulados.append({'arquivo': nome, 'numero': m.group(1), 'titulo': m.group(2)[:60]})
        i += 1

# Herda o que o cabeçalho diz para as variantes por espécie (11.12 -> 11.12.1).
por_numero = {f['numero']: f for f in formulas}
for f in formulas:
    pai = por_numero.get(f['numero'].rsplit('.', 1)[0])
    if not pai:
        continue
    for campo in ('formaFarmaceutica', 'indicacao', 'diferencial'):
        if not f[campo] and pai[campo]:
            f[campo] = pai[campo]
    if not f['especies']:
        f['especies'] = pai['especies']

json.dump(formulas, open(SAIDA, 'w'), ensure_ascii=False, indent=1)

comFormula = [f for f in formulas if f['composicao']]
comDose = [f for f in comFormula if any(
    not i['veiculo'] and re.search(r'\d', i['texto']) for i in f['itens'])]

print(f"guias lidos            {len(arquivos)}")
print(f"formulações extraídas  {len(formulas)}")
print(f"  com composição       {len(comFormula)}")
print(f"  com dose numérica    {len(comDose)}")
print(f"  com espécie definida {sum(1 for f in formulas if f['especies'])}")
print(f"títulos sem corpo      {len(pulados)}")
print("\npor linha terapêutica:")
for k, n in Counter(f['linhaTerapeutica'] for f in formulas).most_common():
    print(f"  {n:4}  {k}")
