'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../dominio-totvs/converter.js');
const tools = require('../assets/tools.js');

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? '  OK   ' : '  FALHA') + ' ' + name + (ok || !detail ? '' : '\n         ' + detail));
  if (!ok) failures++;
}

console.log('Testes do registro de ferramentas (assets/tools.js)');
check('tools.js exporta uma lista de ferramentas', Array.isArray(tools) && tools.length > 0);
tools.forEach(tool => {
  if (tool.status === 'pronto') {
    const dir = path.join(__dirname, '..', tool.caminho);
    const indexPath = path.join(dir, 'index.html');
    const exists = fs.existsSync(dir) && fs.existsSync(indexPath);
    check(`ferramenta "${tool.id}" aponta para pasta com index.html (${tool.caminho})`, exists);
  }
});

const SAMPLES = path.join(__dirname, '..', 'samples');
const domFile = path.join(SAMPLES, 'GOTA DOMINIO GERADO.TXT');
const refFile = path.join(SAMPLES, 'GOTA TESTE.TXT');

console.log('\nTestes unitários');
check('vírgula antes dos 2 últimos dígitos, mantendo zeros', C.formatValue('00099385') === '000993,85');
check('remove acentos sem mudar tamanho', (() => {
  const s = 'MÊS FÉRIAS PRÉ 13º SALÁRIO AÇÃO';
  const r = C.removeAccents(s);
  return r.length === s.length && r === 'MES FERIAS PRE 13  SALARIO ACAO';
})());
check('º e ° viram espaço (mantém alinhamento)', C.removeAccents('13º13°') === '13 13 ');

const l1 = '0001GERAL 04092026AA2131211CCUSTO00001 2131001            INSS <<Competencia>> 09/2026      00099385';
const c1 = C.convertLine(l1, 1).out, c2 = C.convertLine(l1, 2).out;
check('linha ímpar = db, par = cr, minúsculo', c1.substr(18, 2) === 'db' && c2.substr(18, 2) === 'cr');
check('texto <<Competencia>> é preservado', c1.includes('<<Competencia>>'));

const crlf = C.convertText(l1 + '\r\n' + l1 + '\r\n');
check('CRLF preservado, sem linha vazia extra', crlf.outputText.split('\r\n').length === 3 && crlf.outputText.endsWith('\r\n') && !crlf.outputText.endsWith('\r\n\r\n'));
const lf = C.convertText(l1 + '\n' + l1);
check('LF preservado e sem quebra final quando o original não tinha', !lf.outputText.includes('\r') && !lf.outputText.endsWith('\n') && lf.writtenCount === 2);

const bad = C.convertText(l1 + '\n' + l1.replace(/00099385$/, '0009938X'));
check('valor inválido e par divergente são detectados', bad.hasErrors && bad.checks.find(c => c.id === 'valor8').items[0] === 2);
check('quantidade ímpar é detectada', C.convertText(l1).checks.find(c => c.id === 'par').ok === false);

const enc = C.encodeWindows1252('É€中');
check('Windows-1252: É=0xC9, €=0x80, fora do mapa vira "?"', enc[0] === 0xC9 && enc[1] === 0x80 && enc[2] === 0x3F);
check('decodifica Windows-1252 quando não é UTF-8', C.decodeBuffer(Uint8Array.from([0x4D, 0xCA, 0x53]).buffer).text === 'MÊS');
check('decodifica UTF-8 estrito', C.decodeBuffer(Buffer.from('MÊS', 'utf8')).text === 'MÊS');

console.log('\nTestes do layout Domínio atual (CR/DB)');
const hist = 'VALOR A COMPENSAR REF. SALÁRIO FAMÍLIA 09/2026';
const mk = (seq, tipo, conta, val) => seq + 'GERAL 30092026' + tipo + conta + 'CCUSTO00000 2131001            ' + hist.padEnd(53) + val;
const nIn1 = mk('0001', 'CR', '2131101', '18911   ');
const nIn2 = mk('0002', 'DB', '2131211', '18911   ');
const nOut1 = C.convertLine(nIn1, 1).out, nOut2 = C.convertLine(nIn2, 2).out;
check('CR/DB: linha 1 -> "cr" e valor 000189,11', nOut1 === C.removeAccents(mk('0001', 'cr', '2131101', '000189,11')), nOut1);
check('CR/DB: linha 2 -> "db" e valor 000189,11', nOut2 === C.removeAccents(mk('0002', 'db', '2131211', '000189,11')), nOut2);
check('CR/DB: não inverte (CR na linha ímpar continua cr, DB na par continua db)', nOut1.substr(18, 2) === 'cr' && nOut2.substr(18, 2) === 'db');
check('CR/DB: DB na linha ímpar também é respeitado', C.convertLine(nIn2, 1).out.substr(18, 2) === 'db');
check('valor "315     " -> 000003,15 e "523355  " -> 005233,55 (8 dígitos)',
  C.convertLine(mk('0001', 'CR', '2131101', '315     '), 1).out.endsWith('000003,15') &&
  C.convertLine(mk('0001', 'CR', '2131101', '523355  '), 1).out.endsWith('005233,55'));
check('layout antigo e novo dão o mesmo valor', C.convertLine(mk('0001', 'AA', '2131101', '00018911'), 1).out.endsWith('000189,11'));
const pairNew = C.convertText(nIn1 + '\r\n' + nIn2 + '\r\n');
check('CR/DB: layout detectado = atual, sem erros, soma db = cr',
  pairNew.layout === 'atual' && pairNew.layoutLabel === 'Domínio atual (CR/DB)' && !pairNew.hasErrors && pairNew.sumDbCents === 18911 && pairNew.sumCrCents === 18911);
check('CR/DB: tamanho da saída = entrada + 1', pairNew.outputLines.every((o, i) => o.length === pairNew.inputLines[i].length + 1));
check('AA: layout detectado = antigo', C.convertText(l1 + '\n' + l1).layoutLabel === 'Layout antigo (AA)');
const bothCr = C.convertText(nIn1 + '\n' + nIn1);
check('CR/DB: par com dois CR é erro', bothCr.hasErrors && bothCr.checks.find(c => c.id === 'par_crdb').ok === false);
const mixed = C.convertText(nIn1 + '\n' + l1);
check('arquivo misturando AA e CR/DB é erro vermelho', mixed.layout === 'misto' && mixed.checks.find(c => c.id === 'tipo').ok === false && mixed.hasErrors);
check('valor não numérico no layout novo é detectado', C.convertText(nIn1 + '\n' + nIn2.replace('18911   ', '189X1   ')).checks.find(c => c.id === 'valor8').ok === false);

const contFile = path.join(SAMPLES, 'CONT GOTA.TXT');
if (!fs.existsSync(contFile)) {
  console.log('  PULADO CONT GOTA.TXT: amostra ausente em samples/ (a pasta não vai para o GitHub).');
} else {
  const raw = fs.readFileSync(contFile);
  const d = C.decodeBuffer(new Uint8Array(raw).buffer);
  const r = C.convertText(d.text);
  check('CONT GOTA: 1454 linhas de 151 caracteres, Windows-1252', r.readCount === 1454 && r.inputLines.every(l => l.length === 151) && d.encoding === 'Windows-1252');
  check('CONT GOTA: layout atual e nenhuma validação falhou', r.layout === 'atual' && !r.hasErrors, r.checks.filter(c => !c.ok).map(c => c.label + ': ' + c.detail).join(' | '));
  check('CONT GOTA: nenhuma linha trocada de db/cr em relação à entrada',
    r.outputLines.every((o, i) => o.substr(18, 2) === r.inputLines[i].substr(18, 2).toLowerCase()));
  check('CONT GOTA: 727 cr + 727 db, soma db = soma cr',
    r.outputLines.filter(o => o.substr(18, 2) === 'cr').length === 727 && r.outputLines.filter(o => o.substr(18, 2) === 'db').length === 727 &&
    r.sumDbCents === r.sumCrCents && r.sumDbCents > 0, 'db ' + r.sumDbCents + ' cr ' + r.sumCrCents);
  check('CONT GOTA: todos os valores com vírgula (formato 000000,00)', r.outputLines.every(o => /\d{6},\d{2}$/.test(o)));
  check('CONT GOTA: primeira linha = esperado', r.outputLines[0].startsWith('0001GERAL 30092026cr2131101CCUSTO00000 2131001') && r.outputLines[0].endsWith('000189,11'));
  check('CONT GOTA: saída = entrada + 1 em todas as linhas, CRLF', r.outputLines.every(o => o.length === 152) && r.outputText.endsWith('\r\n'));
}

console.log('\nTestes com os arquivos de exemplo');
if (!fs.existsSync(domFile) || !fs.existsSync(refFile)) {
  console.log('  FALHA pasta samples/ ausente (ela não vai para o GitHub). Copie os arquivos de exemplo para rodar estes testes.');
  failures++;
} else {
  const dom = fs.readFileSync(domFile);
  const dec = C.decodeBuffer(dom.buffer.slice(dom.byteOffset, dom.byteOffset + dom.length));
  check('arquivo da Domínio lido como Windows-1252', dec.encoding === 'Windows-1252', dec.encoding);

  const res = C.convertText(dec.text);
  const ref = C.splitLines(C.decodeBuffer(new Uint8Array(fs.readFileSync(refFile)).buffer).text).map(l => l.text);

  const expected = ref.slice(0, 2).map(l => C.removeAccents(l));
  check('a) 2 primeiras linhas = GOTA TESTE.TXT (exceto acentos)',
    res.outputLines[0] === expected[0] && res.outputLines[1] === expected[1],
    JSON.stringify([res.outputLines.slice(0, 2), expected]));

  res.checks.forEach(c => check('b) ' + c.label + ' — ' + c.detail, c.ok));
  check('b) nenhuma validação falhou', !res.hasErrors);

  check('c) 302 linhas de saída', res.writtenCount === 302 && res.outputLines.length === 302, String(res.writtenCount));
  check('saída em CRLF com quebra final, como a entrada', res.outputText.endsWith('\r\n') && res.outputText.split('\r\n').length === 303);
  check('saída sem caracteres fora de ASCII (acentos removidos)', !/[^\x00-\x7f]/.test(res.outputText));
  check('12 linhas com CCUSTO00001 trocadas', res.ccustoChanged === 12, String(res.ccustoChanged));
  const bytes = C.encodeWindows1252(res.outputText);
  check('bytes gravados = caracteres (sem BOM)', bytes.length === res.outputText.length && bytes[0] === 0x30);
  console.log('\n  Competências:', res.competencias.map(c => c.key + '=' + c.count).join(', '));
}

require('./ponto.js')(check).then(() => require('./ponto-setembro.js')(check)).then(() => {
  console.log(failures ? '\n' + failures + ' teste(s) FALHARAM' : '\nTodos os testes passaram');
  process.exit(failures ? 1 : 0);
}, e => {
  console.log('  FALHA testes do ponto abortaram: ' + (e && e.stack || e));
  process.exit(1);
});
