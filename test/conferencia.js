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

  const ok170 = { icms: '000', pis: '01', cofins: '01' };
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
  check('regra de base pendente de validação por padrão', r.regraBasePendente === true);
  check('sem tabela validada, base × CST não aponta nada',
    K.checkText(r0200('A1', '12345678') + '\n' + r170('A1', { icms: '040', bcIcms: '100,00', pis: '01', cofins: '01' })).total === 0);

  // Leitura em blocos de 7 caracteres gera o mesmo resultado (inclusive com CRLF partido ao meio)
  const c = K.createChecker();
  for (let i = 0; i < texto.length; i += 7) c.feedChunk(texto.slice(i, i + 7));
  const rb = c.finish();
  check('leitura em blocos = leitura inteira', JSON.stringify(rb.inconsistencias) === JSON.stringify(r.inconsistencias));
  check('última linha sem quebra é lida', K.checkText(r0200('A1', '')).total === 1);

  // Regra base × CST com tabela injetada (a tabela real está pendente de validação)
  const config = {
    REGRA_BASE_VALIDADA: true,
    BASE_POR_CST_ICMS: { '040': 'sem_base', '000': 'exige_base' },
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
};
