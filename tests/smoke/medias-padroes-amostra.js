'use strict';
// Amostras SINTÉTICAS dos padrões da Keli (SYN-196): soma de duas colunas com a mesma rubrica, lançamento repetido
// de verdade (não pode ser escondido pela soma) e nome parcial repetido em várias competências.
// Nomes, matrículas e valores inventados. Não é dado real. Usado por test/medias-dominio.js.
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'ponto-dominio', 'vendor', 'xlsx.full.min.js'));

const AVISO = 'AMOSTRA SINTÉTICA: não é dado real';

// Mesmo cabeçalho da planilha do 13º (aba "Lançamentos por competência")
const CABECALHO = ['Matrícula', 'Empregado', 'Competência MM/AAAA', 'HE 50% (h:mm)', 'HE 65% (h:mm)', 'HE 100% (h:mm)',
  'Adic. noturno (h:mm)', 'Comissões (R$)', 'Prêmio (R$)', 'Assiduidade (R$)', 'DSR HE (R$)', 'DSR noturno (R$)', 'DSR outros (R$)'];

// Uma planilha com as linhas (objetos por nome de cabeçalho; o que não estiver no objeto fica vazio)
function gerarPlanilha(linhas) {
  const aoa = [[AVISO], [], CABECALHO].concat(linhas.map(l => CABECALHO.map(c => (c in l ? l[c] : null))));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Lançamentos por competência');
  return Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

// ---- Soma: DSR HE e DSR outros, ambas com a rubrica 250, do mesmo empregado e competência ----
// Teste Soma Um: as duas colunas na mesma linha -> uma linha 250 com 2000 (R$ 20,00).
// Teste Soma Dois: só DSR HE -> linha 250 com 500, sem soma.
const LINHAS_SOMA = [
  { 'Matrícula': '201', 'Empregado': 'Teste Soma Um', 'Competência MM/AAAA': '09/2026', 'DSR HE (R$)': 'R$ 12,50', 'DSR outros (R$)': 'R$ 7,50' },
  { 'Matrícula': '202', 'Empregado': 'Teste Soma Dois', 'Competência MM/AAAA': '09/2026', 'DSR HE (R$)': 'R$ 5,00' }
];
const TXT_SOMA = ['7;201;01/09/2026;250;2000', '7;202;01/09/2026;250;500'];

// ---- Duplicata real: a MESMA coluna (DSR HE) duas vezes para o mesmo empregado e competência ----
// Mesmo com DSR outros na mesma competência, a repetição bloqueia: a soma não a esconde.
const LINHAS_REPETIDA = [
  { 'Matrícula': '203', 'Empregado': 'Teste Repetido', 'Competência MM/AAAA': '09/2026', 'DSR HE (R$)': 'R$ 12,50', 'DSR outros (R$)': 'R$ 7,50' },
  { 'Matrícula': '203', 'Empregado': 'Teste Repetido', 'Competência MM/AAAA': '09/2026', 'DSR HE (R$)': 'R$ 3,00' }
];

// ---- Nome parcial repetido em 8 competências (01/2026 a 08/2026) ----
// "Teste Parcial Silva Lima" aparece nas 8 competências (um nome distinto). "Teste Parcial Souza Reis" aparece só
// uma vez, em 08/2026: serve para o caso de dois candidatos distintos.
const NOME_UM = 'Teste Parcial Silva Lima';
const NOME_DOIS = 'Teste Parcial Souza Reis';
const COMPETENCIAS_8 = ['01/2026', '02/2026', '03/2026', '04/2026', '05/2026', '06/2026', '07/2026', '08/2026'];
const LINHAS_PARCIAL_8 = COMPETENCIAS_8.map(comp => ({ 'Matrícula': '301', 'Empregado': NOME_UM, 'Competência MM/AAAA': comp, 'HE 50% (h:mm)': '1:00' }));
const LINHAS_PARCIAL_DOIS = LINHAS_PARCIAL_8.slice(0, 7).concat([
  { 'Matrícula': '302', 'Empregado': NOME_DOIS, 'Competência MM/AAAA': '08/2026', 'HE 50% (h:mm)': '1:00' }
]);

// Relação de Empregados sintética: o PDF traz só o início do nome ("TESTE PARCIAL") do empregado 401.
// Itens na ordem do fluxo, cabeçalho Código / Nome / Cargo, como o pdf.js entrega.
const ITENS_PARCIAL = [
  { s: 'Código', x: 30, y: 700, w: 40 }, { s: 'Nome', x: 100, y: 700, w: 30 }, { s: 'Cargo', x: 300, y: 700, w: 30 },
  { s: '401', x: 30, y: 680, w: 15 }, { s: 'TESTE', x: 100, y: 680, w: 35 }, { s: 'PARCIAL', x: 140, y: 680, w: 45 },
  { s: 'AUXILIAR', x: 300, y: 680, w: 50 }
];

module.exports = {
  gerarPlanilha, CABECALHO,
  LINHAS_SOMA, TXT_SOMA,
  LINHAS_REPETIDA,
  NOME_UM, NOME_DOIS, COMPETENCIAS_8, LINHAS_PARCIAL_8, LINHAS_PARCIAL_DOIS,
  ITENS_PARCIAL
};
