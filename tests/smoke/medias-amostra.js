'use strict';
// Amostra SINTÉTICA para o smoke da Médias → Domínio: uma planilha de apuração (.xlsx) e uma Relação de
// Empregados (PDF com texto posicionado). Nomes e códigos inventados. Não é dado real.
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'ponto-dominio', 'vendor', 'xlsx.full.min.js'));

const CABECALHO = ['Matrícula', 'Empregado', 'Competência MM/AAAA', 'HE 50% (h:mm)', 'HE 65% (h:mm)', 'HE 100% (h:mm)',
  'Adic. noturno (h:mm)', 'Comissões (R$)', 'Prêmio (R$)', 'Assiduidade (R$)', 'DSR HE (R$)', 'DSR noturno (R$)', 'DSR outros (R$)'];

// Ana Paula Lima não está na Relação: fica de fora e aparece como pendência "Sem código".
const LINHAS = [
  ['001', 'Maria da Silva', '09/2026', { 'HE 50% (h:mm)': '74:31', 'Assiduidade (R$)': 'R$ 400,00' }],
  ['002', 'José Santos', '09/2026', { 'HE 50% (h:mm)': '1:30', 'DSR HE (R$)': 'R$ 12,50' }],
  ['003', 'Ana Paula Lima', '09/2026', { 'HE 50% (h:mm)': '2:00' }]
];

// Linhas do TXT que a tela deve gerar para a amostra acima (na ordem das colunas da planilha).
const TXT_ESPERADO = [
  '7;101;01/09/2026;150;7431',
  '7;101;01/09/2026;236;40000',
  '7;102;01/09/2026;150;130',
  '7;102;01/09/2026;250;1250'
];

function gerarPlanilhaMedias() {
  const aoa = [['AMOSTRA SINTÉTICA: não é dado real'], [], CABECALHO].concat(LINHAS.map(([mat, nome, comp, valores]) =>
    CABECALHO.map(c => (c === 'Matrícula' ? mat : c === 'Empregado' ? nome : c === 'Competência MM/AAAA' ? comp : (valores[c] !== undefined ? valores[c] : null)))));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Lançamentos por competência');
  return Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

// Relação de Empregados sintética: cabeçalho Código / Nome / Cargo e uma linha por empregado.
// Sem acento no nome do PDF de propósito: a casagem é pelo nome normalizado (planilha tem "José").
const RELACAO = [
  { codigo: '101', nome: 'MARIA DA SILVA', cargo: 'AUXILIAR' },
  { codigo: '102', nome: 'JOSE SANTOS', cargo: 'ANALISTA' }
];

function pdfSintetico(itens) {
  const fluxo = itens.map(i => 'BT /F1 ' + (i.tamanho || 10) + ' Tf ' + i.x + ' ' + i.y + ' Td (' + i.s.replace(/[()\\]/g, '\\$&') + ') Tj ET').join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(fluxo, 'latin1') + ' >>\nstream\n' + fluxo + '\nendstream'
  ];
  let pdf = '%PDF-1.4\n';
  const posicoes = [];
  objetos.forEach((o, i) => { posicoes.push(Buffer.byteLength(pdf, 'latin1')); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 ' + (objetos.length + 1) + '\n0000000000 65535 f \n' +
    posicoes.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + (objetos.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf, 'latin1');
}

function gerarRelacaoPdf() {
  const itens = [{ s: 'Relação de Empregados (AMOSTRA SINTÉTICA)', x: 40, y: 760 },
    { s: 'Código', x: 40, y: 720 }, { s: 'Nome', x: 120, y: 720 }, { s: 'Cargo', x: 330, y: 720 }];
  RELACAO.forEach((e, i) => {
    const y = 700 - i * 20;
    itens.push({ s: e.codigo, x: 40, y }, { s: e.nome, x: 120, y }, { s: e.cargo, x: 330, y });
  });
  return pdfSintetico(itens);
}

// ---- Formato real (SYN-166) ----
// Relação de Empregados no formato que o pdf.js entrega no PDF real: cabeçalho "Código Nome" num texto só,
// código e nome no mesmo texto, nome que avança sobre a coluna do cargo, nome partido em dois textos, dois
// empregados com o mesmo nome (ambíguo) e um nome de planilha que não existe na Relação (sem par).
// Nomes e códigos inventados. A largura de cada texto é uma estimativa (o pdf.js mede no PDF de verdade).
const larg = s => s.length * 5.6;
const txt = (s, x, y) => ({ s, x, y, w: larg(s) });

// Cabeçalho "Código Nome" com 51 pt de largura (como no PDF real: tamanho 8.3 dá ~51 pt no pdf.js)
const ITENS_FORMATO_REAL = [
  { s: 'Relação de Empregados (AMOSTRA SINTÉTICA)', x: 40, y: 760, w: larg('Relação de Empregados (AMOSTRA SINTÉTICA)') },
  { s: 'Código Nome', x: 0, y: 720, w: 51, tamanho: 8.3 },
  { s: 'Cargo', x: 160, y: 720, w: 30 }
];
// linhas de empregado (y de 700 para baixo, 20 pt por linha)
[
  [txt('301 MARCOS ANTONIO PEREIRA DA COSTA AUXILIAR DE PRODUCAO', 0, 0)],
  [txt('302 ROSANGELA MARIA DE OLIVEIRA LIMA ASSISTENTE', 0, 0)],
  [txt('303 CARLA ELISA WEIRICH EBELING ASSISTENTE', 0, 0)],
  [txt('304', 0, 0), txt('FRANCIELE FERREIRA DA', 32, 0), Object.assign(txt('SILVA OPERADOR', 161, 0), { tamanho: 9 })],
  [txt('305 ADELSON DA COSTA', 0, 0), txt('ENCARREGADO', 160, 0)],
  [txt('306 PEDRO HENRIQUE ALVES NETO OPERADOR', 0, 0)],
  [txt('307 LUCAS GABRIEL MOREIRA RIBEIRO ENCARREGADO', 0, 0)],
  [txt('308 ANA PAULA LIMA MONITORA DE CAIXA', 0, 0)],
  [txt('309 JOAO PEDRO', 0, 0), txt('CAIXA', 160, 0)],
  [txt('310 JOAO PEDRO', 0, 0), txt('AUXILIAR', 160, 0)]
].forEach((linha, i) => {
  const y = 700 - i * 20;
  linha.forEach(t => ITENS_FORMATO_REAL.push(Object.assign(t, { y })));
});

// Planilha com o cabeçalho "Competência" (sem MM/AAAA). Uma linha por nome, HE 50% de 1:00.
const PLANILHA_COMPETENCIA = [
  ['401', 'Marcos Antonio Pereira da Costa'], ['402', 'Rosangela Maria de Oliveira Lima'],
  ['403', 'Carla Elisa Weirich Ebeling'], ['404', 'Franciele Ferreira da Silva'], ['405', 'Adelson da Costa'],
  ['406', 'Pedro Henrique Alves Neto'], ['407', 'Lucas Gabriel Moreira Ribeiro'],
  ['408', 'Ana Paula Lima'], ['409', 'Ana Paula'], ['410', 'Joao Pedro'], ['411', 'Carla Mendes']
];

// Resultado esperado para o formato real. Cruzados = 8: os 10 empregados da Relação, menos os dois de "Joao Pedro"
// (ambíguo). Sem par: "Ana Paula" (o nome da planilha mais longo, "Ana Paula Lima", fica com o 308) e "Carla Mendes".
const FORMATO_REAL = {
  empregadosNoPdf: 10,
  cruzados: 8,
  nomesPlanilha: PLANILHA_COMPETENCIA.length,
  ambiguos: ['Joao Pedro'],
  semPar: ['Ana Paula', 'Carla Mendes'],
  txtLinhas: ['7;301;01/09/2026;150;100', '7;302;01/09/2026;150;100', '7;303;01/09/2026;150;100', '7;304;01/09/2026;150;100',
    '7;305;01/09/2026;150;100', '7;306;01/09/2026;150;100', '7;307;01/09/2026;150;100', '7;308;01/09/2026;150;100']
};

function gerarPlanilhaCompetencia() {
  const cab = CABECALHO.map(c => (c === 'Competência MM/AAAA' ? 'Competência' : c));
  const aoa = [['AMOSTRA SINTÉTICA: não é dado real'], [], cab].concat(PLANILHA_COMPETENCIA.map(([mat, nome]) =>
    cab.map(c => (c === 'Matrícula' ? mat : c === 'Empregado' ? nome : c === 'Competência' ? '09/2026' : (c === 'HE 50% (h:mm)' ? '1:00' : null)))));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Lançamentos por competência');
  return Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

function gerarRelacaoPdfFormatoReal() {
  return pdfSintetico(ITENS_FORMATO_REAL);
}

module.exports = {
  gerarPlanilhaMedias, gerarRelacaoPdf, TXT_ESPERADO,
  ITENS_FORMATO_REAL, PLANILHA_COMPETENCIA, FORMATO_REAL, gerarPlanilhaCompetencia, gerarRelacaoPdfFormatoReal
};
