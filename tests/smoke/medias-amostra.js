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
  const fluxo = itens.map(i => 'BT /F1 10 Tf ' + i.x + ' ' + i.y + ' Td (' + i.s.replace(/[()\\]/g, '\\$&') + ') Tj ET').join('\n');
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

module.exports = { gerarPlanilhaMedias, gerarRelacaoPdf, TXT_ESPERADO };
