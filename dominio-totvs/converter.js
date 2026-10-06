/*
 * Conversor Domínio -> TOTVS. Funções puras, sem acesso a rede.
 * Funciona no navegador (window.Conversor) e em Node (module.exports).
 *
 * Layout da linha de entrada (posições 1-based, contando a partir do "0001"):
 *   1-4 sequência | 5-9 "GERAL" | 11-18 data DDMMAAAA | 19-20 tipo
 *   21-27 conta   | 28-38 CCUSTO | ... histórico ...   | últimas 8 posições = valor
 *
 * Dois layouts de entrada:
 *   - Domínio atual (principal): tipo já vem "CR" ou "DB"; valor com centavos sem zeros à
 *     esquerda, alinhado à esquerda, completado com espaços (ex.: "18911   " = 189,11).
 *   - Layout antigo: tipo "AA" (db na 1ª linha do par, cr na 2ª); valor com 8 dígitos.
 * A saída é a mesma nos dois: tipo "db"/"cr" e valor "000189,11".
 */
(function (root) {
  'use strict';

  // Linha ímpar do arquivo = 'db', linha par = 'cr'. Inverter aqui se a contadora mudar a regra.
  const FIRST_LINE_TYPE = 'db';

  // Centro de custo que a Domínio gera sem rateio e que a TOTVS recebeu como outro código
  // (visto em "GOTA TESTE.TXT": CCUSTO00001 -> CCUSTO01100). Ajustar aqui se mudar.
  const CCUSTO_MAP = { 'CCUSTO00001': 'CCUSTO01100' };

  // Posições 0-based
  const TYPE_AT = 18;
  const CCUSTO_AT = 27;
  const CCUSTO_LEN = 11;
  const DATE_AT = 10;
  const DATE_LEN = 8;
  const HISTORY_AT = 38;
  const VALUE_DIGITS = 8;

  // "º", "ª" e "°" não têm equivalente de 1 caractere em ASCII: viram espaço para não deslocar colunas.
  const ORDINAL_REPLACEMENT = ' ';

  const CP1252_EXTRA = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86,
    0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
    0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95,
    0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
  };

  function decodeBuffer(arrayBuffer) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
      return { text: text.replace(/^﻿/, ''), encoding: 'UTF-8' };
    } catch (e) {
      return { text: new TextDecoder('windows-1252').decode(arrayBuffer), encoding: 'Windows-1252' };
    }
  }

  // Preserva o fim de linha de cada linha; não cria linha vazia após o último terminador.
  function splitLines(text) {
    const lines = [];
    const re = /([^\r\n]*)(\r\n|\n|\r|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') break;
      lines.push({ text: m[1], eol: m[2] });
      if (m[2] === '') break;
    }
    return lines;
  }

  function removeAccents(str) {
    let out = '';
    for (const ch of str) {
      if (ch.charCodeAt(0) < 128) { out += ch; continue; }
      if (ch === 'º' || ch === 'ª' || ch === '°') { out += ORDINAL_REPLACEMENT; continue; }
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += (base.length === 1 && base.charCodeAt(0) < 128) ? base : ch;
    }
    return out;
  }

  function formatValue(digits) {
    // Sem zeros à esquerda (o import da Domínio ignorava a última casa decimal com "002351,46");
    // mantém ao menos um dígito antes da vírgula (0,01).
    const int = digits.slice(0, -2).replace(/^0+(?=\d)/, '');
    return int + ',' + digits.slice(-2);
  }

  function lineTypeField(line) {
    return line.substr(TYPE_AT, 2);
  }

  // Dígitos do valor (sempre 8, com zeros à esquerda) lidos das 8 últimas posições,
  // ou null se a linha não terminar em número (com ou sem zeros à esquerda / espaços à direita).
  function valueDigits(line) {
    if (line.length < HISTORY_AT + VALUE_DIGITS) return null;
    const m = /^(\d+) *$/.exec(line.slice(-VALUE_DIGITS));
    return m ? m[1].padStart(VALUE_DIGITS, '0') : null;
  }

  // 'atual' (CR/DB), 'antigo' (AA), 'misto' ou 'desconhecido' (nenhuma linha com AA/CR/DB).
  function detectLayout(lines) {
    let aa = 0, crdb = 0;
    lines.forEach(l => {
      const t = lineTypeField(l);
      if (t === 'AA') aa++; else if (t === 'CR' || t === 'DB') crdb++;
    });
    if (aa && crdb) return 'misto';
    if (crdb) return 'atual';
    if (aa) return 'antigo';
    return 'desconhecido';
  }

  const LAYOUT_LABELS = {
    atual: 'Domínio atual (CR/DB)',
    antigo: 'Layout antigo (AA)',
    misto: 'Misto (AA e CR/DB no mesmo arquivo)',
    desconhecido: 'Não reconhecido'
  };

  // lineNo é 1-based (posição da linha no arquivo).
  function convertLine(line, lineNo, options) {
    const opts = options || {};
    const other = FIRST_LINE_TYPE === 'db' ? 'cr' : 'db';
    const own = lineTypeField(line);
    // CR/DB: usa o que veio. AA (ou qualquer outro): alterna pela posição da linha.
    const type = own === 'CR' || own === 'DB' ? own.toLowerCase()
      : (lineNo % 2 === 1 ? FIRST_LINE_TYPE : other);
    let s = line;
    const info = { type, validValue: false, ccustoChanged: false };

    if (s.length >= TYPE_AT + 2) s = s.slice(0, TYPE_AT) + type + s.slice(TYPE_AT + 2);

    const digits = valueDigits(s);
    if (digits !== null) {
      info.validValue = true;
      s = s.slice(0, s.length - VALUE_DIGITS) + formatValue(digits);
    }

    if (opts.mapCcusto !== false) {
      const cc = s.substr(CCUSTO_AT, CCUSTO_LEN);
      if (Object.prototype.hasOwnProperty.call(CCUSTO_MAP, cc)) {
        s = s.slice(0, CCUSTO_AT) + CCUSTO_MAP[cc] + s.slice(CCUSTO_AT + CCUSTO_LEN);
        info.ccustoChanged = true;
      }
    }

    if (opts.removeAccents !== false) s = removeAccents(s);
    return { out: s, info };
  }

  function parseFields(line) {
    const digits = valueDigits(line);
    const history = line.slice(HISTORY_AT, digits !== null ? line.length - VALUE_DIGITS : line.length);
    const date = line.substr(DATE_AT, DATE_LEN);
    const comp = /(\d{2})\/(\d{4})/.exec(history);
    return {
      date,
      ccusto: line.substr(CCUSTO_AT, CCUSTO_LEN),
      cents: digits !== null ? parseInt(digits, 10) : null,
      competencia: comp ? comp[1] + '/' + comp[2] : date.slice(2, 4) + '/' + date.slice(4, 8),
      competenciaFromHistory: !!comp
    };
  }

  function formatDate(d) {
    return /^\d{8}$/.test(d) ? d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4) : d;
  }

  function centsToBRL(c) {
    const s = String(c).padStart(3, '0');
    return s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s.slice(-2);
  }

  // Caracteres que não cabem em Windows-1252 (viram "?")
  function unencodableChars(text) {
    const bad = [];
    const lines = text.split(/\r\n|\n|\r/);
    lines.forEach((l, i) => {
      for (let j = 0; j < l.length; j++) {
        if (encodeChar(l.charCodeAt(j)) < 0) bad.push({ line: i + 1, col: j + 1, ch: l[j] });
      }
    });
    return bad;
  }

  // Byte Windows-1252 do caractere, ou -1 se não existir.
  function encodeChar(code) {
    if (code < 0x100) return code;
    return CP1252_EXTRA[code] !== undefined ? CP1252_EXTRA[code] : -1;
  }

  function encodeWindows1252(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const e = encodeChar(code);
      bytes[i] = e >= 0 ? e : 0x3F; // "?"
    }
    return bytes;
  }

  function listNumbers(nums, max) {
    max = max || 15;
    const head = nums.slice(0, max).join(', ');
    return nums.length > max ? head + ' … (+' + (nums.length - max) + ')' : head;
  }

  function convertText(text, options) {
    const opts = options || {};
    const lines = splitLines(text);
    const inText = lines.map(l => l.text);
    const outLines = [];
    const infos = [];
    lines.forEach((l, i) => {
      const r = convertLine(l.text, i + 1, opts);
      outLines.push(r.out);
      infos.push(r.info);
    });
    const outputText = outLines.map((o, i) => o + lines[i].eol).join('');
    const fields = inText.map(parseFields);

    const checks = [];
    const add = (id, label, ok, detail, items) => checks.push({ id, label, ok, detail: detail || '', items: items || [] });

    add('par', 'Quantidade de linhas é par', lines.length % 2 === 0,
      lines.length + ' linhas' + (lines.length % 2 ? ' (sobrou a última linha sem par)' : ''));

    const badValue = [];
    inText.forEach((l, i) => { if (!infos[i].validValue) badValue.push(i + 1); });
    add('valor8', 'Valor numérico nas 8 últimas posições (com ou sem zeros à esquerda)', badValue.length === 0,
      badValue.length ? 'Linhas com problema: ' + listNumbers(badValue) : lines.length + ' linhas conferidas', badValue);

    const layout = detectLayout(inText);
    const badType = [];
    inText.forEach((l, i) => {
      const t = lineTypeField(l);
      if (t !== 'AA' && t !== 'CR' && t !== 'DB') badType.push(i + 1);
    });
    const tipoOk = badType.length === 0 && layout !== 'misto';
    add('tipo', 'Campo de tipo (posições 19-20) é "AA" ou "CR"/"DB", sem misturar os dois', tipoOk,
      layout === 'misto' ? 'O arquivo mistura linhas com AA e com CR/DB'
        : badType.length ? 'Linhas com outro conteúdo nas posições 19-20: ' + listNumbers(badType)
          : 'Layout detectado: ' + LAYOUT_LABELS[layout], badType);

    if (layout === 'atual') {
      const badCrDb = [];
      for (let i = 0; i + 1 < lines.length; i += 2) {
        const a = lineTypeField(inText[i]), b = lineTypeField(inText[i + 1]);
        if (!((a === 'CR' && b === 'DB') || (a === 'DB' && b === 'CR'))) badCrDb.push((i + 1) + '-' + (i + 2));
      }
      add('par_crdb', 'Cada par tem exatamente um CR e um DB', badCrDb.length === 0,
        badCrDb.length ? 'Pares (linhas) com problema: ' + listNumbers(badCrDb) : Math.floor(lines.length / 2) + ' pares conferidos', badCrDb);
    }

    const pairIssues = { data: [], ccusto: [], valor: [] };
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const a = fields[i], b = fields[i + 1];
      if (a.date !== b.date) pairIssues.data.push((i + 1) + '-' + (i + 2));
      if (a.ccusto !== b.ccusto) pairIssues.ccusto.push((i + 1) + '-' + (i + 2));
      if (a.cents !== b.cents) pairIssues.valor.push((i + 1) + '-' + (i + 2));
    }
    [['data', 'a mesma data'], ['ccusto', 'o mesmo centro de custo'], ['valor', 'o mesmo valor']].forEach(([k, label]) => {
      const bad = pairIssues[k];
      add('par_' + k, 'Em cada par, as duas linhas têm ' + label, bad.length === 0,
        bad.length ? 'Pares (linhas) diferentes: ' + listNumbers(bad) : Math.floor(lines.length / 2) + ' pares conferidos', bad);
    });

    const badLen = [];
    outLines.forEach((o, i) => {
      if (infos[i].validValue && !/^\d+,\d{2}$/.test(o.slice(inText[i].length - VALUE_DIGITS))) badLen.push(i + 1);
    });
    add('tamanho', 'Valor na saída sem zeros à esquerda, na mesma posição de início', badLen.length === 0,
      badLen.length ? 'Linhas com problema: ' + listNumbers(badLen) : 'Alinhamento preservado', badLen);

    let sumDb = 0, sumCr = 0;
    fields.forEach((f, i) => {
      if (f.cents === null) return;
      if (infos[i].type === 'db') sumDb += f.cents; else sumCr += f.cents;
    });
    add('soma', 'Soma dos valores em "db" = soma em "cr"', sumDb === sumCr,
      'db = R$ ' + centsToBRL(sumDb) + ' | cr = R$ ' + centsToBRL(sumCr));

    const outCount = splitLines(outputText).length;
    add('total', 'Total de linhas lido = escrito', outCount === lines.length,
      'Lidas: ' + lines.length + ' | Escritas: ' + outCount);

    const bad = unencodableChars(outputText);
    add('encoding', 'Todos os caracteres cabem no formato Windows-1252', bad.length === 0,
      bad.length ? bad.length + ' caractere(s) serão gravados como "?": ' +
        listNumbers(bad.map(b => 'linha ' + b.line + ' col ' + b.col + ' "' + b.ch + '"'), 5) : 'Nenhum caractere perdido', bad);

    const byComp = {}, byDate = {};
    fields.forEach(f => {
      byComp[f.competencia] = (byComp[f.competencia] || 0) + 1;
      byDate[f.date] = (byDate[f.date] || 0) + 1;
    });
    const sortComp = k => k.slice(3) + k.slice(0, 2);
    const competencias = Object.keys(byComp).sort((a, b) => sortComp(a) < sortComp(b) ? -1 : 1)
      .map(k => ({ key: k, count: byComp[k] }));
    const datas = Object.keys(byDate).sort((a, b) => (a.slice(4) + a.slice(2, 4) + a.slice(0, 2)) < (b.slice(4) + b.slice(2, 4) + b.slice(0, 2)) ? -1 : 1)
      .map(k => ({ key: formatDate(k), count: byDate[k] }));

    return {
      outputText,
      inputLines: inText,
      outputLines: outLines,
      layout,
      layoutLabel: LAYOUT_LABELS[layout],
      readCount: lines.length,
      writtenCount: outCount,
      ccustoChanged: infos.filter(i => i.ccustoChanged).length,
      ccustoMap: CCUSTO_MAP,
      sumDbCents: sumDb,
      sumCrCents: sumCr,
      competencias,
      datas,
      checks,
      hasErrors: checks.some(c => !c.ok)
    };
  }

  const api = {
    FIRST_LINE_TYPE, CCUSTO_MAP, ORDINAL_REPLACEMENT,
    decodeBuffer, splitLines, removeAccents, formatValue, convertLine, convertText, detectLayout, LAYOUT_LABELS,
    encodeWindows1252, unencodableChars, centsToBRL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Conversor = api;
})(typeof window !== 'undefined' ? window : this);
