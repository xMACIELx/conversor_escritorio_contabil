'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../converter.js');

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? '  OK   ' : '  FALHA') + ' ' + name + (ok || !detail ? '' : '\n         ' + detail));
  if (!ok) failures++;
}

const SAMPLES = path.join(__dirname, '..', 'samples');
const domFile = path.join(SAMPLES, 'GOTA DOMINIO GERADO.TXT');
const refFile = path.join(SAMPLES, 'GOTA TESTE.TXT');

console.log('Testes unitários');
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

console.log(failures ? '\n' + failures + ' teste(s) FALHARAM' : '\nTodos os testes passaram');
process.exit(failures ? 1 : 0);
