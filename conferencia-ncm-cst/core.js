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

  function conferirCstFormato(valor, formato) {
    const v = (valor || '').trim();
    if (v === '') return 'CST ausente';
    if (!formato.test(v)) return 'CST com formato inválido';
    return null;
  }

  // options.config substitui a configuração (usado nos testes). Cada inconsistência:
  // { linha, registro, campo, valor, motivo, item } (linha é 1-based, posição no arquivo).
  function createChecker(options) {
    const cfg = Object.assign({}, Config, (options && options.config) || {});
    const lista = impostos(cfg);
    const itens = new Set();
    const inconsistencias = [];
    const contagem = { linhas: 0, r0200: 0, c170: 0 };
    let resto = '';

    function add(linha, registro, campo, valor, motivo, item) {
      inconsistencias.push({ linha, registro, campo, valor: valor === undefined ? '' : valor, motivo, item });
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
        if (!itens.has(item)) add(linha, 'C170', 'COD_ITEM', item, 'Item sem cadastro no registro 0200 (NCM não conferida)', item);
        lista.forEach(imp => {
          const cst = (f[C170[imp.cst]] || '').trim();
          const motivo = conferirCstFormato(cst, imp.formato);
          if (motivo) { add(linha, 'C170', imp.cst, f[C170[imp.cst]] || '', motivo, item); return; }
          const esperado = imp.tabela[cst];
          if (!esperado) return;
          const base = parseValor(f[C170[imp.base]]);
          if (Number.isNaN(base)) {
            add(linha, 'C170', imp.base, f[C170[imp.base]] || '', 'Base de cálculo não é número', item);
          } else if (esperado === 'sem_base' && base !== 0) {
            add(linha, 'C170', imp.base, f[C170[imp.base]], 'CST ' + cst + ' não tributado, mas a base é maior que 0', item);
          } else if (esperado === 'exige_base' && !(base > 0)) {
            add(linha, 'C170', imp.base, f[C170[imp.base]] || '0', 'CST ' + cst + ' tributado, mas a base é 0', item);
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

  const api = { createChecker, checkText, parseValor, conferirNcm, conferirCstFormato };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Conferencia = api;
})(typeof window !== 'undefined' ? window : this);
