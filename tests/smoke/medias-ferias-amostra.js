'use strict';
// Amostras SINTÉTICAS da planilha do 13º (com Matrícula) e da planilha de férias (sem Matrícula, cabeçalhos
// alternativos "R$" e abas extras). Nomes, códigos e valores inventados. Não é dado real.
// Usado por test/medias-dominio.js. Cada planilha é gerada em código, como as outras amostras.
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'ponto-dominio', 'vendor', 'xlsx.full.min.js'));

const AVISO = 'AMOSTRA SINTÉTICA: não é dado real';

// Cabeçalhos da planilha do 13º (aba "Lançamentos por competência"). Não tem DSR comissões.
const CABECALHO_13 = ['Matrícula', 'Empregado', 'Competência MM/AAAA', 'HE 50% (h:mm)', 'HE 65% (h:mm)', 'HE 100% (h:mm)',
  'Adic. noturno (h:mm)', 'Comissões (R$)', 'Prêmio (R$)', 'Assiduidade (R$)', 'DSR HE (R$)', 'DSR noturno (R$)',
  'DSR outros (R$)', 'Total DSR (R$)', 'Total eventos (R$)'];

// Cabeçalhos da planilha de férias (aba "Por competência"). Sem Matrícula; "R$" no lugar de "(R$)".
const CABECALHO_FERIAS = ['Empregado', 'Início aquisitivo', 'Fim aquisitivo', 'Competência (MM/AAAA)', 'HE 50% (h:mm)',
  'HE 65% (h:mm)', 'HE 100% (h:mm)', 'Adic. noturno (h:mm)', 'Comissões R$', 'Assiduidade R$', 'Prêmio R$',
  'DSR horas extras R$', 'DSR adicional noturno R$', 'DSR comissões R$', 'DSR outros R$', 'Total eventos R$',
  'Total DSR R$', 'Total geral R$', 'Situação'];

// Linhas: objetos por nome de cabeçalho (o que não estiver no objeto fica vazio).
// Só rubricas com código na config (150, 236, 250) recebem valor maior que zero, para o TXT não bloquear.
const LINHAS_13 = [
  { 'Matrícula': '001', 'Empregado': 'Ana Teste Lima', 'Competência MM/AAAA': '09/2026', 'HE 50% (h:mm)': '10:00', 'Assiduidade (R$)': 'R$ 100,00', 'DSR HE (R$)': 'R$ 5,00' },
  { 'Matrícula': '002', 'Empregado': 'Bruno Teste Souza', 'Competência MM/AAAA': '09/2026', 'HE 50% (h:mm)': '2:30', 'Assiduidade (R$)': 'R$ 50,00', 'Comissões (R$)': 'R$ 0,00' },
  { 'Matrícula': '003', 'Empregado': 'Carla Teste Rocha', 'Competência MM/AAAA': '09/2026', 'HE 50% (h:mm)': '0:00', 'DSR HE (R$)': 'R$ 0,00' }
];

const LINHAS_FERIAS = [
  { 'Empregado': 'Ana Teste Lima', 'Início aquisitivo': '01/2025', 'Fim aquisitivo': '01/2026', 'Competência (MM/AAAA)': '09/2026',
    'HE 50% (h:mm)': '10:00', 'HE 65% (h:mm)': '0:00', 'Assiduidade R$': 'R$ 100,00', 'DSR horas extras R$': 'R$ 5,00', 'Situação': 'Em curso' },
  { 'Empregado': 'Bruno Teste Souza', 'Início aquisitivo': '01/2025', 'Fim aquisitivo': '01/2026', 'Competência (MM/AAAA)': '09/2026',
    'HE 50% (h:mm)': '2:30', 'Assiduidade R$': 'R$ 50,00', 'Comissões R$': 'R$ 0,00', 'Situação': 'Em curso' },
  { 'Empregado': 'Diego Teste Alves', 'Início aquisitivo': '03/2025', 'Fim aquisitivo': '03/2026', 'Competência (MM/AAAA)': '09/2026',
    'Assiduidade R$': 'R$ 80,00', 'DSR horas extras R$': 'R$ 4,00', 'Situação': 'Em curso' },
  { 'Empregado': 'Ana Teste Lima', 'Início aquisitivo': '01/2024', 'Fim aquisitivo': '01/2025', 'Competência (MM/AAAA)': '12/2025',
    'HE 50% (h:mm)': '0:00', 'DSR horas extras R$': 'R$ 9,00', 'Situação': 'Encerrado' }
];

// Abas extras (Totais, Critérios, Complementação 2025). Não são dados de importação. A "Complementação 2025" tem
// cabeçalho de Empregado + Competência com um valor ilegível de propósito: se for lida por engano, o teste falha.
function abasExtras() {
  return [
    ['Critérios e ressalvas', [['AMOSTRA SINTÉTICA: não é dado real'], ['Critério', 'Texto'], ['Teste', 'Não é importação']]],
    ['Complementação 2025', [['AMOSTRA SINTÉTICA: não é dado real'], [], ['Empregado', 'Competência', 'HE 50% (h:mm)'],
      ['Ana Teste Lima', '09/2026', '99:99']]]
  ];
}

// Monta a planilha: a aba principal (com o nome dela) e as abas extras. primeiraAba: a aba extra "Totais" vem antes da
// principal, para pegar quem lê sempre a primeira aba.
function gerarPlanilha(cabecalho, linhas, abaPrincipal, primeiraAba) {
  const aoa = [[AVISO], [], cabecalho].concat(linhas.map(l => cabecalho.map(c => (c in l ? l[c] : null))));
  const wb = XLSX.utils.book_new();
  if (primeiraAba) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(primeiraAba[1]), primeiraAba[0]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), abaPrincipal);
  abasExtras().forEach(([nome, dados]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), nome));
  return Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

// Planilha do 13º (aba principal "Lançamentos por competência"; a primeira aba é "Totais")
function gerarPlanilhaDecimoTerceiro(linhas) {
  return gerarPlanilha(CABECALHO_13, linhas || LINHAS_13, 'Lançamentos por competência',
    ['Totais', [[AVISO], [], ['Matrícula', 'Total']]]);
}

// Planilha de férias (aba principal "Por competência"; a primeira aba é "Totais por empregado")
function gerarPlanilhaFerias(linhas) {
  return gerarPlanilha(CABECALHO_FERIAS, linhas || LINHAS_FERIAS, 'Por competência',
    ['Totais por empregado', [[AVISO], [], ['Empregado', 'Total geral R$'], ['Ana Teste Lima', 'R$ 0,00']]]);
}

// Planilha com uma só aba, de nome que a ferramenta não conhece: deve ser lida pela primeira aba
function gerarPlanilhaAbaUnica(linhas) {
  const aoa = [[AVISO], [], CABECALHO_13].concat(linhas.map(l => CABECALHO_13.map(c => (c in l ? l[c] : null))));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Planilha1');
  return Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

module.exports = {
  CABECALHO_13, CABECALHO_FERIAS, LINHAS_13, LINHAS_FERIAS,
  gerarPlanilha, gerarPlanilhaDecimoTerceiro, gerarPlanilhaFerias, gerarPlanilhaAbaUnica
};
