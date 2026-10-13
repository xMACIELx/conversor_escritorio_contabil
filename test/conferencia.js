'use strict';
const K = require('../conferencia-ncm-cst/core.js');

// Amostra fictícia (nenhum dado real). Campos do 0200: REG|COD_ITEM|DESCR|COD_BARRA|COD_ANT|UNID|TIPO|COD_NCM|...
const r0200 = (cod, ncm) => '|0200|' + cod + '|ITEM ' + cod + '||| UN|00|' + ncm + '||||';
// C170 com os campos usados; o resto fica vazio. Índices: 3 item, 10 CST ICMS, 13 base, 25/26 PIS, 31/32 COFINS.
function r170(item, o) {
  const f = new Array(38).fill('');
  f[1] = 'C170'; f[2] = '1'; f[3] = item;
  f[10] = o.icms; f[13] = o.bcIcms || '';
  f[25] = o.pis; f[26] = o.bcPis || '';
  f[31] = o.cofins; f[32] = o.bcCofins || '';
  return f.join('|') + '|';
}

module.exports = function (check) {
  console.log('\nTestes da conferência de NCM/CST');

  const ok170 = { icms: '000', bcIcms: '100,00', pis: '01', cofins: '01' };
  const texto = [
    '|0000|017|0|01012026|31012026|EMPRESA FICTICIA|',
    r0200('A1', '12345678'),   // 2: ok
    r0200('A2', ''),           // 3: NCM ausente
    r0200('A3', '1234567'),    // 4: 7 dígitos
    r0200('A4', '1234567A'),   // 5: não numérico
    '|C100|0|1|F1|55|00|1|1|',
    r170('A1', ok170),         // 7: ok
    r170('A1', { icms: '', pis: '01', cofins: '01' }),        // 8: CST ICMS ausente
    r170('A1', { icms: '900', pis: '00', cofins: '100' }),    // 9: ICMS origem 9 e PIS 00 e COFINS 100
    r170('A1', { icms: '10', pis: '01', cofins: '01' }),      // 10: ICMS com 2 dígitos
    r170('ZZ', ok170),         // 11: item sem 0200
    '|C990|10|'
  ].join('\r\n') + '\r\n';

  const r = K.checkText(texto);
  const por = (linha, campo) => r.inconsistencias.filter(i => i.linha === linha && i.campo === campo);

  check('linhas lidas e registros contados', r.linhasLidas === 12 && r.registros0200 === 4 && r.registrosC170 === 5,
    JSON.stringify([r.linhasLidas, r.registros0200, r.registrosC170]));
  check('NCM válida não gera inconsistência', r.inconsistencias.every(i => i.linha !== 2 && i.linha !== 7));
  check('NCM ausente', por(3, 'COD_NCM').length === 1 && por(3, 'COD_NCM')[0].motivo === 'NCM ausente');
  check('NCM com 7 dígitos', por(4, 'COD_NCM').length === 1 && por(4, 'COD_NCM')[0].valor === '1234567');
  check('NCM não numérica', por(5, 'COD_NCM').length === 1);
  check('CST ICMS ausente', por(8, 'CST_ICMS')[0].motivo === 'CST ausente');
  check('CST ICMS com origem 9 é inválido', por(9, 'CST_ICMS').length === 1);
  check('CST PIS 00 é inválido', por(9, 'CST_PIS').length === 1);
  check('CST COFINS com 3 dígitos é inválido', por(9, 'CST_COFINS').length === 1);
  check('CST ICMS com 2 dígitos é inválido', por(10, 'CST_ICMS').length === 1);
  check('item do C170 sem 0200', por(11, 'COD_ITEM').length === 1);
  check('total de inconsistências', r.total === 9, String(r.total));
  check('cada inconsistência tem linha, campo, valor e motivo',
    r.inconsistencias.every(i => i.linha > 0 && i.campo && i.valor !== undefined && i.motivo));
  check('regra de base validada por padrão: sem banner de pendência', r.regraBasePendente === false);
  check('regra de base pendente quando REGRA_BASE_VALIDADA = false',
    K.checkText(r0200('A1', '12345678'), { config: { REGRA_BASE_VALIDADA: false } }).regraBasePendente === true);

  // Leitura em blocos de 7 caracteres gera o mesmo resultado (inclusive com CRLF partido ao meio)
  const c = K.createChecker();
  for (let i = 0; i < texto.length; i += 7) c.feedChunk(texto.slice(i, i + 7));
  const rb = c.finish();
  check('leitura em blocos = leitura inteira', JSON.stringify(rb.inconsistencias) === JSON.stringify(r.inconsistencias));
  check('última linha sem quebra é lida', K.checkText(r0200('A1', '')).total === 1);

  // Regra base × CST com tabela injetada (chave = 2 últimos dígitos do CST)
  const config = {
    REGRA_BASE_VALIDADA: true,
    BASE_POR_CST_ICMS: { '40': 'sem_base', '00': 'exige_base' },
    BASE_POR_CST_PIS_COFINS: { '04': 'sem_base', '01': 'exige_base' }
  };
  const t2 = [
    r0200('B1', '12345678'),
    r170('B1', { icms: '040', bcIcms: '10,00', pis: '04', bcPis: '0,00', cofins: '04', bcCofins: '5,00' }), // 2
    r170('B1', { icms: '000', bcIcms: '0,00', pis: '01', bcPis: '10,00', cofins: '01', bcCofins: '' }),   // 3
    r170('B1', { icms: '000', bcIcms: 'abc', pis: '01', bcPis: '1,00', cofins: '01', bcCofins: '1,00' }),  // 4
    r170('B1', { icms: '090', bcIcms: '99,00', pis: '99', bcPis: '9,00', cofins: '99', bcCofins: '9,00' })  // 5: CST fora da tabela
  ].join('\n');
  const r2 = K.checkText(t2, { config });
  const motivos = r2.inconsistencias.map(i => i.linha + ':' + i.campo);
  check('CST sem base com base > 0 é apontado', motivos.includes('2:VL_BC_ICMS') && motivos.includes('2:VL_BC_COFINS'), motivos.join(','));
  check('CST sem base com base 0 não é apontado', !motivos.includes('2:VL_BC_PIS'));
  check('CST tributado com base vazia é apontado', motivos.includes('3:VL_BC_COFINS') && !motivos.includes('3:VL_BC_PIS'));
  check('base não numérica é apontada', motivos.includes('4:VL_BC_ICMS'));
  check('CST fora da tabela não é conferido', !motivos.some(m => m.startsWith('5:')));
  check('regraBasePendente = false com tabela validada', r2.regraBasePendente === false);

  // Tabela real validada pela fiscal da MAC (config.js), com origem 0 e 2
  const unica = (cst, bc) => K.checkText(r0200('C1', '12345678') + '\n' +
    r170('C1', { icms: cst, bcIcms: bc, pis: '01', cofins: '01' })).inconsistencias.filter(i => i.campo === 'VL_BC_ICMS');
  ['00', '20', '51', '90'].forEach(fim => ['0', '2'].forEach(origem => {
    const cst = origem + fim;
    check('CST ' + cst + ' com base > 0 não é apontado', unica(cst, '10,00').length === 0);
    check('CST ' + cst + ' com base 0 é apontado', unica(cst, '0,00').length === 1);
    check('CST ' + cst + ' com base vazia é apontado', unica(cst, '').length === 1);
  }));
  ['10', '30', '40', '41', '50', '60', '70'].forEach(fim => ['0', '2'].forEach(origem => {
    const cst = origem + fim;
    check('CST ' + cst + ' com base 0 não é apontado', unica(cst, '0,00').length === 0 && unica(cst, '').length === 0);
    const m = unica(cst, '10,00');
    check('CST ' + cst + ' com base > 0 é apontado', m.length === 1 && /não tributado/.test(m[0].motivo), JSON.stringify(m));
  }));
  ['051', '090', '251', '290'].forEach(cst => {
    const m = unica(cst, '0,00');
    check('CST ' + cst + ' com base 0: motivo de análise caso a caso', m.length === 1 && /analisar caso a caso/.test(m[0].motivo), JSON.stringify(m));
  });
  check('CST 000 com base 0 mantém o motivo comum (sem análise caso a caso)', !/caso a caso/.test(unica('000', '0,00')[0].motivo));
  check('CST fora da tabela (02, 80) não é conferido', unica('002', '0,00').length === 0 && unica('080', '5,00').length === 0);
  check('PIS/COFINS não são conferidos quanto à base (decisão pendente)',
    K.checkText(r0200('C1', '12345678') + '\n' + r170('C1', { icms: '000', bcIcms: '1,00', pis: '04', bcPis: '9,00', cofins: '01', bcCofins: '0' })).total === 0);

  // CST de 4 dígitos (possível CSOSN do Simples)
  const q = K.checkText([r0200('D1', '12345678'),
    r170('D1', { icms: '0101', bcIcms: '1,00', pis: '01', cofins: '01' }),
    r170('D1', { icms: '1234', bcIcms: '1,00', pis: '01', cofins: '01' }),
    r170('D1', { icms: '10', bcIcms: '1,00', pis: '01', cofins: '01' })].join('\n'));
  const cst = linha => q.inconsistencias.filter(i => i.linha === linha && i.campo === 'CST_ICMS');
  check('CST ICMS de 4 dígitos é inconsistência com motivo de CSOSN',
    [2, 3].every(l => cst(l).length === 1 && /CSOSN do Simples Nacional/.test(cst(l)[0].motivo) &&
      /não é esperado no SPED/.test(cst(l)[0].motivo) && /tributação do contribuinte/.test(cst(l)[0].motivo)), JSON.stringify(q.inconsistencias));
  check('CST de 2 dígitos continua com o motivo genérico', cst(4).length === 1 && cst(4)[0].motivo === 'CST com formato inválido');
  check('CST de 4 dígitos não gera conferência de base', q.inconsistencias.filter(i => i.campo === 'VL_BC_ICMS').length === 0);

  // CST em cada inconsistência
  check('inconsistência de NCM (0200) fica com CST vazio', por(3, 'COD_NCM')[0].cst === '' && por(4, 'COD_NCM')[0].cst === '');
  check('item sem cadastro no 0200 fica com CST vazio', por(11, 'COD_ITEM')[0].cst === '');
  check('CST ICMS de 4 dígitos carrega o CST como está no C170', cst(2)[0].cst === '0101' && cst(3)[0].cst === '1234');
  check('CST ICMS de 2 dígitos carrega o CST como está no C170', cst(4)[0].cst === '10');
  check('CST ICMS ausente: CST vazio', por(8, 'CST_ICMS')[0].cst === '');
  check('inconsistência de PIS/COFINS carrega o CST de ICMS do item', por(9, 'CST_PIS')[0].cst === '900' && por(9, 'CST_COFINS')[0].cst === '900');
  check('inconsistência de base carrega o CST de ICMS do item', unica('051', '0,00')[0].cst === '051' && unica('040', '9,00')[0].cst === '040');
  check('todas as inconsistências têm o campo cst (texto)', r.inconsistencias.every(i => typeof i.cst === 'string'));

  // Resumo com mais de 2.000 inconsistências: conta todas
  const gran = [r0200('G1', '12345678'), r0200('G2', 'XX')]; // 1 NCM inválida
  const ESP = { '051': 2500, '090': 1700, '0101': 1000 };    // 5.200 de CST + 1 NCM + 300 sem cadastro
  Object.keys(ESP).forEach(c => {
    for (let k = 0; k < ESP[c]; k++) gran.push(r170('G1', { icms: c, bcIcms: c === '0101' ? '1,00' : '0,00', pis: '01', cofins: '01' }));
  });
  for (let k = 0; k < 300; k++) gran.push(r170('SEM', ok170));
  const rg = K.checkText(gran.join('\n'));
  const res = rg.resumo;
  const cstDe = c => (res.porCst.find(e => e.cst === c) || {}).total;
  const motDe = m => (res.porMotivo.find(e => e.motivo === m) || {}).total;
  check('resumo: total considera todas (mais de 2.000)', res.total === 5501 && rg.total === 5501 && rg.inconsistencias.length === 5501, String(res.total));
  check('resumo por CST', cstDe('051') === 2500 && cstDe('090') === 1700 && cstDe('0101') === 1000 && cstDe('') === 301, JSON.stringify(res.porCst));
  check('resumo por CST soma o total', res.porCst.reduce((s, e) => s + e.total, 0) === res.total);
  check('resumo por motivo agrupa sem o texto variável',
    motDe('CST deve ter base maior que 0, mas a base é 0: analisar caso a caso') === 4200 &&
    motDe('Item sem cadastro no registro 0200 (NCM não conferida)') === 300 &&
    motDe('NCM fora do formato de 8 dígitos') === 1 && res.porMotivo.length === 4 &&
    res.porMotivo.some(e => /^CST com 4 dígitos/.test(e.motivo) && e.total === 1000), JSON.stringify(res.porMotivo));
  const cm = (c, m) => (res.porCstMotivo.find(e => e.cst === c && /analisar caso a caso/.test(e.motivo) === m) || {}).total;
  check('resumo por CST e motivo (051 e 090 base zero)', cm('051', true) === 2500 && cm('090', true) === 1700);
  check('resumo por CST e motivo soma o total', res.porCstMotivo.reduce((s, e) => s + e.total, 0) === res.total);
  check('resumo ordenado do maior para o menor', res.porCst.every((e, i, a) => i === 0 || a[i - 1].total >= e.total));
  check('resumo sem inconsistências', K.checkText(r0200('A1', '12345678')).resumo.total === 0);
  const cb = K.createChecker();
  for (let i = 0; i < gran.join('\n').length; i += 1000) cb.feedChunk(gran.join('\n').slice(i, i + 1000));
  check('resumo igual lendo em blocos', JSON.stringify(cb.finish().resumo) === JSON.stringify(res));

  // CSV
  const csv = K.gerarCsv(rg.inconsistencias);
  const linhasCsv = csv.split('\r\n');
  check('CSV começa com BOM UTF-8', csv.charCodeAt(0) === 0xFEFF && Buffer.from(csv.slice(0, 1), 'utf8').equals(Buffer.from([0xEF, 0xBB, 0xBF])));
  check('CSV: cabeçalho e ordem das colunas', linhasCsv[0] === '﻿linha;registro;campo;valor;motivo;item;CST', linhasCsv[0]);
  check('CSV: todas as inconsistências (não limitado a 2.000)', linhasCsv.length === 5501 + 2 && linhasCsv[linhasCsv.length - 1] === '', String(linhasCsv.length));
  check('CSV: quebra de linha CRLF (sem LF solto)', !/[^\r]\n/.test(csv) && csv.endsWith('\r\n'));
  check('CSV: linha de dados no formato esperado',
    linhasCsv[1] === '2;"0200";"COD_NCM";"XX";"NCM fora do formato de 8 dígitos";"G2";""', linhasCsv[1]);
  check('CSV: CST preenchido', /;"051"$/.test(linhasCsv[3]), linhasCsv[3]);
  const esc = K.gerarCsv([{ linha: 7, registro: 'C170', campo: 'COD_ITEM', valor: 'A"B;C', motivo: 'diz "x"; y', item: 'it;em', cst: '' }]).split('\r\n');
  check('CSV: aspas duplas escapadas e ponto e vírgula dentro de aspas',
    esc[1] === '7;"C170";"COD_ITEM";"A""B;C";"diz ""x""; y";"it;em";""', esc[1]);
  check('CSV vazio: só BOM e cabeçalho', K.gerarCsv([]) === '﻿linha;registro;campo;valor;motivo;item;CST\r\n');
  const partes = K.gerarCsvPartes(rg.inconsistencias, 1000);
  check('CSV em partes: várias partes, BOM só na primeira, mesmo conteúdo',
    partes.length > 1 && partes.join('') === csv && partes.slice(1).every(p => p.charCodeAt(0) !== 0xFEFF), String(partes.length));
};
