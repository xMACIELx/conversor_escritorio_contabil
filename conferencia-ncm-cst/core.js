/*
 * Conferência de NCM e CST sobre o SPED Fiscal (EFD ICMS/IPI). Funções puras, sem acesso a rede.
 * Funciona no navegador (window.Conferencia) e em Node (module.exports).
 *
 * Registros lidos (campos separados por "|", índice 0 é vazio por causa do "|" inicial):
 *   0200 cadastro do item:  [2] COD_ITEM | [8] COD_NCM
 *   C170 item da nota:      [2] NUM_ITEM | [3] COD_ITEM | [10] CST_ICMS | [13] VL_BC_ICMS
 *                           [25] CST_PIS | [26] VL_BC_PIS | [31] CST_COFINS | [32] VL_BC_COFINS
 *
 * O arquivo pode passar de 80 MB: use createChecker() e alimente em blocos (feedChunk). Só guarda os
 * códigos de item do 0200 e a lista de inconsistências, nunca o texto inteiro.
 */
(function (root) {
  'use strict';

  const Config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.ConferenciaConfig;

  const R0200 = { COD_ITEM: 2, COD_NCM: 8 };
  const C170 = {
    COD_ITEM: 3, CST_ICMS: 10, VL_BC_ICMS: 13,
    CST_PIS: 25, VL_BC_PIS: 26, CST_COFINS: 31, VL_BC_COFINS: 32
  };

  // Impostos conferidos no C170: campo do CST, campo da base, formato e tabela de base.
  function impostos(cfg) {
    return [
      { cst: 'CST_ICMS', base: 'VL_BC_ICMS', formato: cfg.FORMATO_CST_ICMS, tabela: cfg.BASE_POR_CST_ICMS },
      { cst: 'CST_PIS', base: 'VL_BC_PIS', formato: cfg.FORMATO_CST_PIS_COFINS, tabela: cfg.BASE_POR_CST_PIS_COFINS },
      { cst: 'CST_COFINS', base: 'VL_BC_COFINS', formato: cfg.FORMATO_CST_PIS_COFINS, tabela: cfg.BASE_POR_CST_PIS_COFINS }
    ];
  }

  // Valor monetário do SPED ("1234,56"; vazio = 0). NaN se não for número.
  function parseValor(txt) {
    const t = (txt || '').trim();
    if (t === '') return 0;
    return /^-?\d+(,\d+)?$/.test(t) ? parseFloat(t.replace(',', '.')) : NaN;
  }

  // Confere NCM de uma linha 0200. Devolve inconsistências (sem número de linha).
  function conferirNcm(valor, formato) {
    const v = (valor || '').trim();
    if (v === '') return 'NCM ausente';
    if (!formato.test(v)) return 'NCM fora do formato de 8 dígitos';
    return null;
  }

  const MOTIVO_CST_4_DIGITOS = 'CST com 4 dígitos: pode ser CSOSN do Simples Nacional, que não é esperado no SPED ' +
    '(o lançamento segue a tributação do contribuinte, não a do fornecedor)';

  function conferirCstFormato(valor, formato) {
    const v = (valor || '').trim();
    if (v === '') return 'CST ausente';
    if (!formato.test(v)) {
      if (/^\d{4}$/.test(v)) return MOTIVO_CST_4_DIGITOS;
      return 'CST com formato inválido';
    }
    return null;
  }

  // Tipos de motivo sem o texto variável (o CST entra como dimensão própria do resumo).
  const TIPO_NAO_TRIBUTADO = 'CST não tributado, mas a base é maior que 0';
  const TIPO_TRIBUTADO = 'CST tributado, mas a base é 0';
  const TIPO_ANALISE = 'CST deve ter base maior que 0, mas a base é 0: analisar caso a caso';

  const SEP_CHAVE = '\u0000';

  function ordenar(lista) {
    return lista.sort((a, b) => b.total - a.total || (a.cst || '').localeCompare(b.cst || '') ||
      (a.motivo || '').localeCompare(b.motivo || ''));
  }

  // options.config substitui a configuração (usado nos testes). Cada inconsistência:
  // { linha, registro, campo, valor, motivo, item, cst } (linha é 1-based, posição no arquivo).
  // cst = CST de ICMS do C170 como aparece no arquivo; vazio quando a inconsistência não tem CST
  // (NCM do 0200 e item sem cadastro no 0200).
  function createChecker(options) {
    const cfg = Object.assign({}, Config, (options && options.config) || {});
    const lista = impostos(cfg);
    const itens = new Set();
    const inconsistencias = [];
    const porCst = new Map();
    const porMotivo = new Map();
    const porCstMotivo = new Map();
    const contagem = { linhas: 0, r0200: 0, c170: 0 };
    let resto = '';

    function soma(mapa, chave) { mapa.set(chave, (mapa.get(chave) || 0) + 1); }

    // tipo = motivo sem o texto variável; o resumo conta todas as inconsistências, não só as exibidas.
    function add(linha, registro, campo, valor, motivo, item, cst, tipo) {
      cst = cst || '';
      inconsistencias.push({ linha, registro, campo, valor: valor === undefined ? '' : valor, motivo, item, cst });
      tipo = tipo || motivo;
      soma(porCst, cst);
      soma(porMotivo, tipo);
      soma(porCstMotivo, cst + SEP_CHAVE + tipo);
    }

    function resumo() {
      const lista = mapa => Array.from(mapa, ([k, total]) => ({ k, total }));
      return {
        total: inconsistencias.length,
        porCst: ordenar(lista(porCst).map(e => ({ cst: e.k, total: e.total }))),
        porMotivo: ordenar(lista(porMotivo).map(e => ({ motivo: e.k, total: e.total }))),
        porCstMotivo: ordenar(lista(porCstMotivo).map(e => {
          const p = e.k.split(SEP_CHAVE);
          return { cst: p[0], motivo: p[1], total: e.total };
        }))
      };
    }

    function feedLine(texto, linha) {
      contagem.linhas++;
      if (texto.charCodeAt(0) !== 124) return; // não começa com "|"
      const f = texto.split('|');
      const reg = f[1];
      if (reg === '0200') {
        contagem.r0200++;
        const item = f[R0200.COD_ITEM] || '';
        itens.add(item);
        const motivo = conferirNcm(f[R0200.COD_NCM], cfg.FORMATO_NCM);
        if (motivo) add(linha, '0200', 'COD_NCM', f[R0200.COD_NCM] || '', motivo, item);
      } else if (reg === 'C170') {
        contagem.c170++;
        const item = f[C170.COD_ITEM] || '';
        const cstItem = (f[C170.CST_ICMS] || '').trim();
        if (!itens.has(item)) add(linha, 'C170', 'COD_ITEM', item, 'Item sem cadastro no registro 0200 (NCM não conferida)', item, '');
        lista.forEach(imp => {
          const cst = (f[C170[imp.cst]] || '').trim();
          const motivo = conferirCstFormato(cst, imp.formato);
          if (motivo) { add(linha, 'C170', imp.cst, f[C170[imp.cst]] || '', motivo, item, cstItem); return; }
          const esperado = imp.tabela[cst.slice(-2)];
          if (!esperado) return;
          const base = parseValor(f[C170[imp.base]]);
          if (Number.isNaN(base)) {
            add(linha, 'C170', imp.base, f[C170[imp.base]] || '', 'Base de cálculo não é número', item, cstItem);
          } else if (esperado === 'sem_base' && base !== 0) {
            add(linha, 'C170', imp.base, f[C170[imp.base]], 'CST ' + cst + ' não tributado, mas a base é maior que 0', item, cstItem, TIPO_NAO_TRIBUTADO);
          } else if (esperado === 'exige_base' && !(base > 0)) {
            add(linha, 'C170', imp.base, f[C170[imp.base]] || '0', 'CST ' + cst + ' tributado, mas a base é 0', item, cstItem, TIPO_TRIBUTADO);
          } else if (esperado === 'exige_base_analise' && !(base > 0)) {
            add(linha, 'C170', imp.base, f[C170[imp.base]] || '0',
              'CST ' + cst + ' deve ter base maior que 0, mas a base é 0: analisar caso a caso (pode ser operação sem base)', item, cstItem, TIPO_ANALISE);
          }
        });
      }
    }

    // Aceita blocos de texto em qualquer ponto (inclusive no meio de uma linha).
    function feedChunk(texto) {
      let s = resto + texto;
      // Um "\r" no fim do bloco pode ser o começo de um CRLF partido: espera o próximo bloco.
      const cr = s.endsWith('\r') ? '\r' : '';
      if (cr) s = s.slice(0, -1);
      const partes = s.split(/\r\n|\n|\r/);
      resto = partes.pop() + cr;
      partes.forEach(l => feedLine(l, contagem.linhas + 1));
    }

    function finish() {
      resto = resto.replace(/\r$/, '');
      if (resto !== '') { feedLine(resto, contagem.linhas + 1); resto = ''; }
      return {
        inconsistencias,
        total: inconsistencias.length,
        resumo: resumo(),
        linhasLidas: contagem.linhas,
        itensCadastrados: itens.size,
        registros0200: contagem.r0200,
        registrosC170: contagem.c170,
        regraBasePendente: !cfg.REGRA_BASE_VALIDADA
      };
    }

    return { feedLine, feedChunk, finish };
  }

  function checkText(texto, options) {
    const c = createChecker(options);
    c.feedChunk(texto);
    return c.finish();
  }

  const CABECALHO_CSV = 'linha;registro;campo;valor;motivo;item;CST';

  // Campo de texto: sempre entre aspas duplas, aspas internas dobradas.
  function campoCsv(v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; }

  function linhaCsv(i) {
    return i.linha + ';' + campoCsv(i.registro) + ';' + campoCsv(i.campo) + ';' + campoCsv(i.valor) + ';' +
      campoCsv(i.motivo) + ';' + campoCsv(i.item) + ';' + campoCsv(i.cst);
  }

  // CSV com TODAS as inconsistências, em partes (strings) para não montar um texto gigante de uma vez:
  // new Blob(partes, { type: 'text/csv;charset=utf-8' }). Separador ";", CRLF, BOM UTF-8 no início
  // (primeira parte), cabeçalho na primeira linha. linhasPorParte é opcional (padrão 5.000).
  function gerarCsvPartes(inconsistencias, linhasPorParte) {
    const n = linhasPorParte > 0 ? linhasPorParte : 5000;
    const partes = [];
    let buf = ['﻿' + CABECALHO_CSV];
    for (let k = 0; k < inconsistencias.length; k++) {
      buf.push(linhaCsv(inconsistencias[k]));
      if (buf.length >= n) { partes.push(buf.join('\r\n') + '\r\n'); buf = []; }
    }
    if (buf.length) partes.push(buf.join('\r\n') + '\r\n');
    return partes;
  }

  function gerarCsv(inconsistencias) { return gerarCsvPartes(inconsistencias).join(''); }

  const api = { createChecker, checkText, parseValor, conferirNcm, conferirCstFormato, gerarCsvPartes, gerarCsv };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Conferencia = api;
})(typeof window !== 'undefined' ? window : this);
