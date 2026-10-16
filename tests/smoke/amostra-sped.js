'use strict';
// Amostra SINTETICA de SPED Fiscal para o smoke test. Todos os dados são inventados: empresa, CNPJs, CPF e NCMs
// fictícios. Nunca copie dados de um SPED real para cá.
//
// Resultado esperado na Conferência de NCM e CST (ver ESPERADO no fim):
//   NF 1001 (entrada, fornecedor com CNPJ): item correto, nenhuma inconsistência.
//   NF 1002 (entrada, produtor rural com CPF): CST 051 com base 0, aceito (fora do total).
//   NF 1003 (entrada, fornecedor com CNPJ): CST 090 com base 0 e C110 sem crédito, vai para "a conferir no XML".
//   NF 1004 (saída): PIS e COFINS com CST 01 e base 0, 2 inconsistências.

// Layout dos registros (índices como em conferencia-ncm-cst/core.js; o 0 é vazio por causa do "|" inicial).
const r0150 = (cod, nome, cnpj, cpf) => ['', '0150', cod, nome, '01058', cnpj, cpf, '', '', '', '', '', ''].join('|') + '|';
const r0200 = (cod, descr, ncm) => ['', '0200', cod, descr, '', '', 'UN', '00', ncm, '', '', '', '', '', ''].join('|') + '|';
const r0450 = (cod, txt) => '|0450|' + cod + '|' + txt + '|';
const rC100 = (oper, codPart, nf, data) => {
  const f = new Array(30).fill('');
  f[1] = 'C100'; f[2] = oper; f[3] = oper === '0' ? '1' : '0'; f[4] = codPart; f[5] = '55'; f[6] = '00';
  f[7] = '1'; f[8] = nf; f[9] = ''; f[10] = data; f[12] = '100,00';
  return f.join('|') + '|';
};
const rC110 = (codInf, compl) => '|C110|' + codInf + '|' + compl + '|';
// C170: 3 COD_ITEM, 10 CST_ICMS, 11 CFOP, 13 VL_BC_ICMS, 25/26 CST e base do PIS, 31/32 CST e base da COFINS.
function rC170(n, item, o) {
  const f = new Array(38).fill('');
  f[1] = 'C170'; f[2] = String(n); f[3] = item; f[10] = o.icms; f[11] = o.cfop; f[13] = o.bcIcms;
  f[25] = o.pis; f[26] = o.bcPis; f[31] = o.cofins; f[32] = o.bcCofins;
  return f.join('|') + '|';
}

function gerarAmostraSped() {
  const linhas = [
    '|0000|017|0|01102026|31102026|EMPRESA FICTICIA SMOKE LTDA|11222333000181|||SP|',
    r0150('F1', 'FORNECEDOR FICTICIO ALFA LTDA', '11444777000161', ''),
    r0150('F2', 'PRODUTOR RURAL FICTICIO', '', '52998224725'),
    r0150('F3', 'FORNECEDOR FICTICIO BETA ME', '45723174000110', ''),
    r0150('C1', 'CLIENTE FICTICIO GAMA LTDA', '07526557000100', ''),
    r0200('P1', 'PRODUTO FICTICIO UM', '99990001'),
    r0200('P2', 'PRODUTO FICTICIO DOIS', '99990002'),
    r0200('P3', 'PRODUTO FICTICIO TRES', '99990003'),
    r0200('P4', 'PRODUTO FICTICIO QUATRO', '99990004'),
    r0450('INF1', 'TEXTO FICTICIO SEM CREDITO'),
    '|0990|11|',
    rC100('0', 'F1', '1001', '05102026'),
    rC170(1, 'P1', { icms: '000', cfop: '1102', bcIcms: '100,00', pis: '50', bcPis: '100,00', cofins: '50', bcCofins: '100,00' }),
    rC100('0', 'F2', '1002', '06102026'),
    rC170(1, 'P2', { icms: '051', cfop: '1102', bcIcms: '0,00', pis: '70', bcPis: '0,00', cofins: '70', bcCofins: '0,00' }),
    rC100('0', 'F3', '1003', '07102026'),
    rC110('INF1', ''),
    rC170(1, 'P3', { icms: '090', cfop: '1102', bcIcms: '0,00', pis: '70', bcPis: '0,00', cofins: '70', bcCofins: '0,00' }),
    rC100('1', 'C1', '1004', '08102026'),
    rC170(1, 'P4', { icms: '000', cfop: '5102', bcIcms: '100,00', pis: '01', bcPis: '0,00', cofins: '01', bcCofins: '0,00' }),
    '|C990|10|',
    '|9999|20|'
  ];
  return linhas.join('\r\n') + '\r\n';
}

// O que a tela deve mostrar com esta amostra (conferido pelo smoke test).
const ESPERADO = {
  registros0200: 4,
  registrosC170: 4,
  registrosC100: 4,
  inconsistencias: 2,   // PIS e COFINS da NF 1004
  cst051Aceitos: 1,     // NF 1002
  conferirXmlItens: 1   // NF 1003
};

module.exports = { gerarAmostraSped, ESPERADO };
