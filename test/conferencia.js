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
  check('inconsistência de PIS/COFINS carrega o CST_PIS / CST_COFINS correspondente', por(9, 'CST_PIS')[0].cst === '00' && por(9, 'CST_COFINS')[0].cst === '100');
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
  check('CSV: cabeçalho e ordem das colunas', linhasCsv[0] === '﻿linha;registro;campo;valor;motivo;item;imposto;CST;NF;serie;data;operacao;chave', linhasCsv[0]);
  check('CSV: todas as inconsistências (não limitado a 2.000)', linhasCsv.length === 5501 + 2 && linhasCsv[linhasCsv.length - 1] === '', String(linhasCsv.length));
  check('CSV: quebra de linha CRLF (sem LF solto)', !/[^\r]\n/.test(csv) && csv.endsWith('\r\n'));
  check('CSV: linha de dados no formato esperado',
    linhasCsv[1] === '2;"0200";"COD_NCM";"XX";"NCM fora do formato de 8 dígitos";"G2";"";"";"";"";"";"";""', linhasCsv[1]);
  check('CSV: imposto e CST preenchidos', /;"ICMS";"051";"";"";"";"";""$/.test(linhasCsv[3]), linhasCsv[3]);
  const esc = K.gerarCsv([{ linha: 7, registro: 'C170', campo: 'COD_ITEM', valor: 'A"B;C', motivo: 'diz "x"; y', item: 'it;em', cst: '' }]).split('\r\n');
  check('CSV: aspas duplas escapadas e ponto e vírgula dentro de aspas',
    esc[1] === '7;"C170";"COD_ITEM";"A""B;C";"diz ""x""; y";"it;em";"";"";"";"";"";"";""', esc[1]);
  check('CSV vazio: só BOM e cabeçalho', K.gerarCsv([]) === '﻿linha;registro;campo;valor;motivo;item;imposto;CST;NF;serie;data;operacao;chave\r\n');
  const partes = K.gerarCsvPartes(rg.inconsistencias, 1000);
  check('CSV em partes: várias partes, BOM só na primeira, mesmo conteúdo',
    partes.length > 1 && partes.join('') === csv && partes.slice(1).every(p => p.charCodeAt(0) !== 0xFEFF), String(partes.length));

  // ---- Contexto da nota (C100) ----
  // C100: [2] IND_OPER [3] IND_EMIT [4] COD_PART [5] COD_MOD [6] COD_SIT [7] SER [8] NUM_DOC [9] CHV_NFE [10] DT_DOC
  const r100 = (oper, nf, serie, data, chave) => {
    const f = new Array(30).fill('');
    f[1] = 'C100'; f[2] = oper; f[3] = '0'; f[5] = '55'; f[6] = '00'; f[7] = serie; f[8] = nf; f[9] = chave; f[10] = data;
    return f.join('|') + '|';
  };
  const CH1 = '35260112345678000190550010000000011000000011';
  const CH2 = '35260112345678000190550010000000021000000022';
  const ruim = { icms: '040', bcIcms: '5,00', pis: '01', cofins: '01' }; // 1 inconsistência de ICMS
  const bom = { icms: '000', bcIcms: '5,00', pis: '99', cofins: '99' };
  const tn = [
    r0200('N1', '12345678'),
    r170('N1', ruim),                                   // 2: sem C100 antes
    r100('1', '100', '1', '05012026', CH1),             // 3
    r170('N1', ruim),                                   // 4
    r170('N1', bom),                                    // 5: ok
    r170('N1', ruim),                                   // 6
    r100('0', '200', '2', '06012026', CH2),             // 7
    r170('N1', ruim),                                   // 8
    '|C990|9|',
    r170('N1', ruim)                                    // 10: depois do fim do bloco C
  ].join('\n');
  const rn = K.checkText(tn);
  const nota = l => rn.inconsistencias.find(i => i.linha === l);
  const dados = i => [i.nf, i.serie, i.data, i.operacao, i.chave].join('/');
  check('C170 sem C100 antes: não quebra e deixa os campos da nota vazios', dados(nota(2)) === '////' && nota(2).nf === '' && nota(2).chave === '');
  check('contexto do C100 propagado para os C170 seguintes', dados(nota(4)) === ['100', '1', '05012026', '1', CH1].join('/') && dados(nota(6)) === dados(nota(4)), dados(nota(4)));
  check('contexto troca no próximo C100', dados(nota(8)) === ['200', '2', '06012026', '0', CH2].join('/'), dados(nota(8)));
  check('contexto zera no fim do bloco C (C990)', dados(nota(10)) === '////');
  check('contagem de C100 e de C170 sem C100', rn.registrosC100 === 2 && rn.c170SemC100 === 2, JSON.stringify([rn.registrosC100, rn.c170SemC100]));
  check('inconsistência do 0200 não leva contexto de nota', K.checkText(r100('1', '1', '1', '01012026', CH1) + '\n' + r0200('A', '')).inconsistencias[0].nf === '');
  check('contexto igual lendo em blocos', (() => {
    const c2 = K.createChecker();
    for (let i = 0; i < tn.length; i += 5) c2.feedChunk(tn.slice(i, i + 5));
    return JSON.stringify(c2.finish().inconsistencias) === JSON.stringify(rn.inconsistencias);
  })());

  // ---- Regra de PIS/COFINS (CST x base) ----
  const pc = (oper, cst, bc, qual) => {
    const o = { icms: '000', bcIcms: '1,00', pis: '99', cofins: '99' };
    if (qual === 'pis') { o.pis = cst; o.bcPis = bc; } else { o.cofins = cst; o.bcCofins = bc; }
    return K.checkText([r0200('P1', '12345678'), r100(oper, '1', '1', '01012026', CH1), r170('P1', o)].join('\n'))
      .inconsistencias.filter(i => i.campo === (qual === 'pis' ? 'VL_BC_PIS' : 'VL_BC_COFINS'));
  };
  const LISTAS = { '0': ['50', '51', '52', '53', '56', '98'], '1': ['01', '02', '03', '49'] };
  Object.keys(LISTAS).forEach(oper => LISTAS[oper].forEach(cst => ['pis', 'cofins'].forEach(qual => {
    const nome = qual.toUpperCase(), op = oper === '0' ? 'entrada' : 'saída', tag = nome + ' ' + cst + ' de ' + op;
    ['0,00', ''].forEach(bc => {
      const m = pc(oper, cst, bc, qual);
      check('CST ' + tag + ' com base ' + (bc || 'vazia') + ' é apontado',
        m.length === 1 && m[0].motivo === 'CST ' + nome + ' ' + cst + ' de ' + op + ' deve ter base maior que 0, mas a base é 0' &&
        m[0].cst === cst && m[0].operacao === oper && m[0].valor === (bc || '0'), JSON.stringify(m));
    });
    check('CST ' + tag + ' com base maior que 0 não é apontado', pc(oper, cst, '10,00', qual).length === 0);
    check('CST ' + tag + ' com base não numérica: aponta "não é número"', (m => m.length === 1 && m[0].motivo === 'Base de cálculo não é número')(pc(oper, cst, 'abc', qual)));
  })));
  // A lista de saída não vale na entrada e vice-versa; CSTs fora das listas nunca são apontados
  check('CST de saída (01) em nota de entrada não é apontado', pc('0', '01', '0,00', 'pis').length === 0 && pc('0', '49', '0,00', 'cofins').length === 0);
  check('CST de entrada (51) em nota de saída não é apontado', pc('1', '51', '0,00', 'pis').length === 0 && pc('1', '98', '0,00', 'cofins').length === 0);
  const fora = ['04', '05', '06', '07', '08', '09', '49', '50', '60', '66', '70', '73', '74', '75', '99'];
  check('CST fora das listas (base 0 ou > 0) não é apontado, entrada e saída',
    ['0', '1'].every(oper => fora.every(cst => (LISTAS[oper].includes(cst)) ||
      ['pis', 'cofins'].every(q => pc(oper, cst, '0,00', q).length === 0 && pc(oper, cst, '9,00', q).length === 0))));
  check('PIS e COFINS são conferidos separadamente', (() => {
    const t = [r0200('P1', '12345678'), r100('0', '1', '1', '01012026', CH1),
      r170('P1', { icms: '000', bcIcms: '1,00', pis: '51', bcPis: '0,00', cofins: '51', bcCofins: '8,00' })].join('\n');
    const m = K.checkText(t).inconsistencias;
    return m.length === 1 && m[0].campo === 'VL_BC_PIS' && m[0].cst === '51';
  })());
  check('tabela "sem base" de PIS/COFINS continua vazia (pendente da fiscal)', Object.keys(require('../conferencia-ncm-cst/config.js').BASE_POR_CST_PIS_COFINS).length === 0);
  const semC100 = K.checkText([r0200('P1', '12345678'), r170('P1', { icms: '000', bcIcms: '1,00', pis: '51', bcPis: '0', cofins: '01', bcCofins: '0' })].join('\n'));
  check('sem C100 (operação desconhecida): regra de PIS/COFINS não é aplicada e fica registrado',
    semC100.total === 0 && semC100.c170PisCofinsSemOperacao === 1, JSON.stringify([semC100.total, semC100.c170PisCofinsSemOperacao]));
  check('IND_OPER inválido: regra de PIS/COFINS não é aplicada',
    K.checkText([r0200('P1', '12345678'), r100('9', '1', '1', '01012026', CH1), r170('P1', { icms: '000', bcIcms: '1,00', pis: '51', bcPis: '0', cofins: '01', bcCofins: '0' })].join('\n')).total === 0);
  check('regra de ICMS não muda com o contexto da nota',
    K.checkText([r0200('P1', '12345678'), r100('1', '1', '1', '01012026', CH1), r170('P1', { icms: '000', bcIcms: '0,00', pis: '99', cofins: '99' })].join('\n'))
      .inconsistencias.map(i => i.motivo).join() === 'CST 000 tributado, mas a base é 0');

  // ---- Resumo por nota ----
  const tr = [
    r0200('R1', '12345678'),
    r170('R1', ruim),                                                                         // sem nota: fora do resumo por nota
    r100('1', '300', '1', '10012026', CH1),
    r170('R1', ruim),                                                                         // ICMS
    r170('R1', { icms: '040', bcIcms: '5,00', pis: '01', bcPis: '0', cofins: '02', bcCofins: '0' }), // ICMS + PIS + COFINS (saída)
    r170('ZZ', { icms: '000', bcIcms: '1,00', pis: '99', cofins: '99' }),                      // item sem 0200
    r100('0', '301', '1', '11012026', CH2),
    r170('R1', { icms: '000', bcIcms: '1,00', pis: '99', cofins: '99' }),                      // ok
    r100('0', '302', '3', '12012026', ''),
    r170('R1', { icms: '000', bcIcms: '0,00', pis: '51', bcPis: '0', cofins: '99' })           // ICMS + PIS
  ].join('\n');
  const rr = K.checkText(tr);
  const pn = rr.resumo.porNota;
  check('resumo por nota: só notas com inconsistência, mais inconsistências primeiro',
    pn.length === 2 && pn[0].nf === '300' && pn[0].total === 7 && pn[1].nf === '302' && pn[1].total === 2, JSON.stringify(pn));
  check('resumo por nota: NF, série, data, operação e chave',
    pn[0].serie === '1' && pn[0].data === '10012026' && pn[0].operacao === '1' && pn[0].chave === CH1 &&
    pn[1].serie === '3' && pn[1].data === '12012026' && pn[1].operacao === '0' && pn[1].chave === '');
  check('resumo por nota: tipos de motivo (sem repetir)', pn[0].motivos.length === 4 && new Set(pn[0].motivos).size === 4 &&
    pn[0].motivos.includes('CST PIS de saída deve ter base maior que 0, mas a base é 0') &&
    pn[0].motivos.includes('CST COFINS de saída deve ter base maior que 0, mas a base é 0') &&
    pn[0].motivos.includes('Item sem cadastro no registro 0200 (NCM não conferida)') &&
    pn[1].motivos.includes('CST PIS de entrada deve ter base maior que 0, mas a base é 0') &&
    pn[1].motivos.includes('CST tributado, mas a base é 0'), JSON.stringify(pn));
  check('resumo por nota não altera o resumo geral (total conta também as sem nota)',
    rr.resumo.total === 10 && rr.total === 10 && pn.reduce((s, n) => s + n.total, 0) === 9);
  check('resumo por nota igual lendo em blocos', (() => {
    const c3 = K.createChecker();
    for (let i = 0; i < tr.length; i += 11) c3.feedChunk(tr.slice(i, i + 11));
    return JSON.stringify(c3.finish().resumo.porNota) === JSON.stringify(pn);
  })());
  check('resumo por nota vazio sem inconsistências', K.checkText(r0200('A1', '12345678')).resumo.porNota.length === 0);

  // ---- CSV de inconsistências com contexto da nota ----
  const csvN = K.gerarCsv(rr.inconsistencias).split('\r\n');
  check('CSV: contexto da nota nas últimas colunas', csvN[2] === '4;"C170";"VL_BC_ICMS";"5,00";"CST 040 não tributado, mas a base é maior que 0";"R1";"ICMS";"040";"300";"1";"10/01/2026";"1";"' + CH1 + '"', csvN[2]);
  check('CSV: inconsistência sem nota com colunas da nota vazias', /;"ICMS";"040";"";"";"";"";""$/.test(csvN[1]), csvN[1]);
  check('CSV: PIS/COFINS usa o CST_PIS / CST_COFINS na coluna CST',
    csvN.some(l => /;"VL_BC_PIS";"0";"CST PIS 01 de saída deve ter base maior que 0, mas a base é 0";"R1";"PIS";"01";"300"/.test(l)) &&
    csvN.some(l => /;"VL_BC_COFINS";"0";"CST COFINS 02 de saída deve ter base maior que 0, mas a base é 0";"R1";"COFINS";"02";"300"/.test(l)), csvN.join('\n'));
  check('CSV: BOM, CRLF e ponto e vírgula', csvN[0].charCodeAt(0) === 0xFEFF && csvN[0].split(';').length === 13 && csvN.every(l => l === '' || l.split(';').length >= 13));

  // ---- CSV por nota ----
  const csvNotas = K.gerarCsvNotas(pn);
  const ln = csvNotas.split('\r\n');
  check('CSV por nota: BOM UTF-8 e cabeçalho', csvNotas.charCodeAt(0) === 0xFEFF && ln[0] === '﻿NF;serie;data;operacao;chave;quantidade_inconsistencias;motivos', ln[0]);
  check('CSV por nota: uma linha por nota, CRLF', ln.length === 4 && ln[3] === '' && !/[^\r]\n/.test(csvNotas));
  check('CSV por nota: linha de dados (quantidade sem aspas, motivos separados por " | ")',
    ln[1].startsWith('"300";"1";"10/01/2026";"1";"' + CH1 + '";7;"') && ln[1].split(' | ').length === 4 &&
    ln[2] === '"302";"3";"12/01/2026";"0";"";2;"' + pn[1].motivos.join(' | ') + '"', ln[2]);
  check('CSV por nota vazio: só BOM e cabeçalho', K.gerarCsvNotas([]) === '﻿NF;serie;data;operacao;chave;quantidade_inconsistencias;motivos\r\n');
  const pnt = K.gerarCsvNotasPartes(Array.from({ length: 2500 }, (_, k) => ({ nf: String(k), serie: '1', data: '', operacao: '1', chave: '', total: 1, motivos: ['x'] })), 1000);
  check('CSV por nota em partes: BOM só na primeira e mesmo conteúdo', pnt.length === 3 && pnt.slice(1).every(p => p.charCodeAt(0) !== 0xFEFF) && pnt.join('').split('\r\n').length === 2502);

  // ---- Campo imposto, resumo por imposto + CST e data DD/MM/AAAA (SYN-38) ----
  const imp = (rs, campo, linha) => rs.inconsistencias.filter(i => i.campo === campo && i.linha === linha).map(i => i.imposto).join();
  const ti = [
    r0200('I1', 'XX'),                                                                          // 1: NCM inválida
    r100('1', '400', '1', '15032026', CH1),                                                     // 2
    r170('ZZ', { icms: '000', bcIcms: '1,00', pis: '99', cofins: '99' }),                        // 3: item sem 0200
    r170('I1', { icms: '000', bcIcms: '0,00', pis: '99', cofins: '99' }),                        // 4: ICMS (base)
    r170('I1', { icms: '1234', bcIcms: '1,00', pis: '99', cofins: '99' }),                       // 5: ICMS (CST formato)
    r170('I1', { icms: '000', bcIcms: '1,00', pis: '01', bcPis: '0', cofins: '99' }),            // 6: PIS (base)
    r170('I1', { icms: '000', bcIcms: '1,00', pis: 'X', cofins: '99' }),                         // 7: PIS (CST formato)
    r170('I1', { icms: '000', bcIcms: '1,00', pis: '99', cofins: '02', bcCofins: '0' }),         // 8: COFINS (base)
    r170('I1', { icms: '000', bcIcms: '1,00', pis: '99', cofins: '', bcCofins: '0' }),           // 9: COFINS (CST ausente)
    r170('I1', { icms: '000', bcIcms: 'abc', pis: '99', cofins: '99' })                          // 10: ICMS (base não numérica)
  ].join('\n');
  const ri = K.checkText(ti);
  check('imposto vazio em NCM inválida (0200) e item sem cadastro', imp(ri, 'COD_NCM', 1) === '' && imp(ri, 'COD_ITEM', 3) === '' &&
    ri.inconsistencias.filter(i => i.registro === '0200' || i.campo === 'COD_ITEM').length === 2, JSON.stringify(ri.inconsistencias));
  check('imposto ICMS: base, CST e base não numérica', imp(ri, 'VL_BC_ICMS', 4) === 'ICMS' && imp(ri, 'CST_ICMS', 5) === 'ICMS' && imp(ri, 'VL_BC_ICMS', 10) === 'ICMS', JSON.stringify(ri.inconsistencias));
  check('imposto PIS: base e CST_PIS', imp(ri, 'VL_BC_PIS', 6) === 'PIS' && imp(ri, 'CST_PIS', 7) === 'PIS');
  check('imposto COFINS: base e CST_COFINS', imp(ri, 'VL_BC_COFINS', 8) === 'COFINS' && imp(ri, 'CST_COFINS', 9) === 'COFINS');
  check('imposto preenchido em todas as de C170 (exceto item sem cadastro) e vazio nas demais',
    ri.inconsistencias.every(i => (i.imposto !== '') === (i.registro === 'C170' && i.campo !== 'COD_ITEM')), JSON.stringify(ri.inconsistencias.map(i => i.campo + ':' + i.imposto)));
  check('imposto igual lendo em blocos', (() => {
    const c4 = K.createChecker();
    for (let i = 0; i < ti.length; i += 7) c4.feedChunk(ti.slice(i, i + 7));
    return JSON.stringify(c4.finish().inconsistencias) === JSON.stringify(ri.inconsistencias);
  })());

  // Resumo por imposto + CST: ICMS 051 e PIS 51 (mesmo número) ficam separados
  const tc = [r0200('C1', '12345678'), r100('0', '500', '1', '01022026', CH1),
    r170('C1', { icms: '051', bcIcms: '0,00', pis: '51', bcPis: '0,00', cofins: '51', bcCofins: '0,00' }),
    r170('C1', { icms: '051', bcIcms: '0,00', pis: '51', bcPis: '0,00', cofins: '99' }),
    r170('C1', { icms: '051', bcIcms: '0,00', pis: '99', cofins: '99' }),
    r170('C1', { icms: '', bcIcms: '1,00', pis: '99', cofins: '99' }),
    r170('ZZ', { icms: '000', bcIcms: '1,00', pis: '99', cofins: '99' })].join('\n');
  const rc = K.checkText(tc);
  const pc2 = (i, c) => (rc.resumo.porCst.find(e => e.imposto === i && e.cst === c) || {}).total;
  check('resumo por imposto + CST: ICMS 051, PIS 51 e COFINS 51 separados',
    pc2('ICMS', '051') === 3 && pc2('PIS', '51') === 2 && pc2('COFINS', '51') === 1, JSON.stringify(rc.resumo.porCst));
  check('resumo por imposto + CST: CST ausente de ICMS separado do item sem 0200', pc2('ICMS', '') === 1 && pc2('', '') === 1);
  check('resumo por imposto + CST: soma o total (todas as inconsistências)', rc.resumo.porCst.reduce((s, e) => s + e.total, 0) === rc.resumo.total && rc.resumo.total === 8, String(rc.resumo.total));
  check('resumo por imposto + CST: ordenado do maior para o menor', rc.resumo.porCst.every((e, i, a) => i === 0 || a[i - 1].total >= e.total));
  check('resumo por imposto + CST e motivo carrega o imposto e soma o total',
    rc.resumo.porCstMotivo.every(e => typeof e.imposto === 'string') && rc.resumo.porCstMotivo.reduce((s, e) => s + e.total, 0) === rc.resumo.total);
  check('resumo por motivo e por nota continuam', rc.resumo.porMotivo.length > 0 && rc.resumo.porNota.length === 1 && rc.resumo.porNota[0].nf === '500' && rc.resumo.porNota[0].total === 8, JSON.stringify(rc.resumo.porNota));

  // CSV de inconsistências: colunas e ordem, imposto e data
  const csvI = K.gerarCsv(ri.inconsistencias).split('\r\n');
  const col = (l, n) => l.split(';')[n];
  const dalinha = n => csvI.find(l => l.startsWith(n + ';'));
  check('CSV inconsistências: colunas e ordem', csvI[0] === '﻿linha;registro;campo;valor;motivo;item;imposto;CST;NF;serie;data;operacao;chave', csvI[0]);
  check('CSV inconsistências: imposto antes do CST; vazio nas que não são de imposto',
    col(dalinha(6), 6) === '"PIS"' && col(dalinha(6), 7) === '"01"' && col(dalinha(1), 6) === '""' && col(dalinha(3), 6) === '""');
  check('CSV inconsistências: data DD/MM/AAAA', col(dalinha(4), 10) === '"15/03/2026"' && !csvI.join('').includes('15032026'), dalinha(4));
  check('CSV inconsistências: sem C100 a data fica vazia', col(K.gerarCsv(K.checkText(r0200('A', 'XX')).inconsistencias).split('\r\n')[1], 10) === '""');
  const dtc = d => K.gerarCsv([{ linha: 1, registro: 'C170', campo: 'x', valor: '', motivo: '', item: '', imposto: '', cst: '', nf: '', serie: '', data: d, operacao: '', chave: '' }]).split('\r\n')[1].split(';')[10];
  check('data inválida ou fora do padrão é preservada, sem quebrar', dtc('31022026') === '"31022026"' && dtc('00012026') === '"00012026"' &&
    dtc('1503') === '"1503"' && dtc('abc') === '"abc"' && dtc('') === '""' && dtc(undefined) === '""' && dtc('29022024') === '"29/02/2024"', [dtc('31022026'), dtc('00012026'), dtc('abc')].join());
  check('CSV inconsistências: BOM, CRLF e 13 colunas', csvI[0].charCodeAt(0) === 0xFEFF && csvI.every(l => l === '' || l.split(';').length === 13) && !/[^\r]\n/.test(csvI.join('\r\n')));

  // CSV por nota: data DD/MM/AAAA e data inválida preservada
  const csvNi = K.gerarCsvNotas([
    { nf: '1', serie: '1', data: '15032026', operacao: '1', chave: '', total: 2, motivos: ['a "b"'] },
    { nf: '2', serie: '1', data: '31022026', operacao: '0', chave: '', total: 1, motivos: ['c'] },
    { nf: '3', serie: '1', data: '', operacao: '0', chave: '', total: 1, motivos: ['d'] }]).split('\r\n');
  check('CSV por nota: colunas e ordem', csvNi[0] === '﻿NF;serie;data;operacao;chave;quantidade_inconsistencias;motivos');
  check('CSV por nota: data convertida, inválida preservada, vazia vazia',
    csvNi[1] === '"1";"1";"15/03/2026";"1";"";2;"a ""b"""' && csvNi[2].split(';')[2] === '"31022026"' && csvNi[3].split(';')[2] === '""', csvNi.join('|'));
  check('CSV por nota: data DD/MM/AAAA vinda do arquivo', K.gerarCsvNotas(pn).includes('"10/01/2026"') && !K.gerarCsvNotas(pn).includes('10012026'));
};
