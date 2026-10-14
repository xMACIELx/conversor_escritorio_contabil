/*
 * Conferência de NCM e CST sobre o SPED Fiscal (EFD ICMS/IPI). Funções puras, sem acesso a rede.
 * Funciona no navegador (window.Conferencia) e em Node (module.exports).
 *
 * Registros lidos (campos separados por "|", índice 0 é vazio por causa do "|" inicial):
 *   0200 cadastro do item:  [2] COD_ITEM | [8] COD_NCM
 *   C100 nota (NF):         [2] IND_OPER (0 entrada, 1 saída) | [7] SER | [8] NUM_DOC | [9] CHV_NFE | [10] DT_DOC
 *   C170 item da nota:      [2] NUM_ITEM | [3] COD_ITEM | [10] CST_ICMS | [13] VL_BC_ICMS
 *                           [25] CST_PIS | [26] VL_BC_PIS | [31] CST_COFINS | [32] VL_BC_COFINS
 *
 * No arquivo, o C100 (a nota) vem seguido dos seus C170 (itens): o C100 corrente vale para os C170 seguintes
 * até o próximo C100 (ou o fim do bloco C, C990). C170 sem C100 antes fica com os campos da nota vazios.
 *
 * O arquivo pode passar de 80 MB: use createChecker() e alimente em blocos (feedChunk). Só guarda os
 * códigos de item do 0200 e a lista de inconsistências, nunca o texto inteiro.
 */
(function (root) {
  'use strict';

  const Config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.ConferenciaConfig;

  const R0200 = { COD_ITEM: 2, DESCR_ITEM: 3, COD_NCM: 8 };
  const C100 = { IND_OPER: 2, SER: 7, NUM_DOC: 8, CHV_NFE: 9, DT_DOC: 10 };
  const C170 = {
    COD_ITEM: 3, CST_ICMS: 10, VL_BC_ICMS: 13,
    CST_PIS: 25, VL_BC_PIS: 26, CST_COFINS: 31, VL_BC_COFINS: 32
  };

  // Impostos conferidos no C170: campo do CST, campo da base, formato e tabela de base.
  function impostos(cfg) {
    return [
      { cst: 'CST_ICMS', base: 'VL_BC_ICMS', nome: 'ICMS', formato: cfg.FORMATO_CST_ICMS, tabela: cfg.BASE_POR_CST_ICMS },
      { cst: 'CST_PIS', base: 'VL_BC_PIS', nome: 'PIS', pisCofins: true, formato: cfg.FORMATO_CST_PIS_COFINS, tabela: cfg.BASE_POR_CST_PIS_COFINS },
      { cst: 'CST_COFINS', base: 'VL_BC_COFINS', nome: 'COFINS', pisCofins: true, formato: cfg.FORMATO_CST_PIS_COFINS, tabela: cfg.BASE_POR_CST_PIS_COFINS }
    ];
  }

  const OPERACAO = { '0': 'entrada', '1': 'saída' };
  const CAMPOS_NOTA_VAZIOS = { nf: '', serie: '', data: '', operacao: '', chave: '' };

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
      (a.imposto || '').localeCompare(b.imposto || '') || (a.motivo || '').localeCompare(b.motivo || ''));
  }

  // options.config substitui a configuração (usado nos testes). Cada inconsistência:
  // { linha, registro, campo, valor, motivo, item, imposto, cst, nf, serie, data, operacao, chave } (linha é 1-based).
  // imposto = ICMS, PIS ou COFINS conforme a regra que gerou a inconsistência; vazio nas que não são de imposto
  // (NCM do 0200 e item sem cadastro no 0200).
  // cst = CST do imposto conferido como aparece no C170 (CST_ICMS; CST_PIS ou CST_COFINS nas de PIS/COFINS);
  // vazio quando a inconsistência não tem CST (NCM do 0200 e item sem cadastro no 0200).
  // nf, serie, data, operacao (IND_OPER: 0 entrada, 1 saída) e chave vêm do C100 corrente; vazios sem C100
  // (e sempre vazios nas do 0200).
  function createChecker(options) {
    const cfg = Object.assign({}, Config, (options && options.config) || {});
    const lista = impostos(cfg);
    const itens = new Set();
    const ncmDoItem = new Map(); // COD_ITEM -> chave do mapa por NCM
    const porNcm = new Map();    // NCM como está no 0200 -> { descricao, itens, c170, csts: Map }
    const inconsistencias = [];
    const porCst = new Map();
    const porMotivo = new Map();
    const porCstMotivo = new Map();
    const porNota = new Map(); // chave = linha do C100; só notas com inconsistência
    const contagem = { linhas: 0, r0200: 0, c170: 0, c100: 0, c170SemC100: 0, pisCofinsSemOperacao: 0 };
    let nota = null; // C100 corrente: { linha, nf, serie, data, operacao, chave }
    let resto = '';

    function soma(mapa, chave) { mapa.set(chave, (mapa.get(chave) || 0) + 1); }

    // tipo = motivo sem o texto variável; o resumo conta todas as inconsistências, não só as exibidas.
    function add(linha, registro, campo, valor, motivo, item, cst, tipo, daNota, imposto) {
      cst = cst || '';
      imposto = imposto || '';
      tipo = tipo || motivo;
      const ctx = daNota || CAMPOS_NOTA_VAZIOS;
      inconsistencias.push({
        linha, registro, campo, valor: valor === undefined ? '' : valor, motivo, item, imposto, cst,
        nf: ctx.nf, serie: ctx.serie, data: ctx.data, operacao: ctx.operacao, chave: ctx.chave
      });
      if (daNota) {
        let n = porNota.get(daNota.linha);
        if (!n) {
          n = { nf: ctx.nf, serie: ctx.serie, data: ctx.data, operacao: ctx.operacao, chave: ctx.chave, total: 0, tipos: new Set() };
          porNota.set(daNota.linha, n);
        }
        n.total++;
        n.tipos.add(tipo);
      }
      soma(porCst, imposto + SEP_CHAVE + cst);
      soma(porMotivo, tipo);
      soma(porCstMotivo, imposto + SEP_CHAVE + cst + SEP_CHAVE + tipo);
    }

    function resumo() {
      const lista = mapa => Array.from(mapa, ([k, total]) => ({ k, total }));
      return {
        total: inconsistencias.length,
        // Agrupado por imposto + CST: o mesmo número pode existir em impostos diferentes (ICMS 051, PIS 51).
        porCst: ordenar(lista(porCst).map(e => {
          const p = e.k.split(SEP_CHAVE);
          return { imposto: p[0], cst: p[1], total: e.total };
        })),
        porMotivo: ordenar(lista(porMotivo).map(e => ({ motivo: e.k, total: e.total }))),
        porCstMotivo: ordenar(lista(porCstMotivo).map(e => {
          const p = e.k.split(SEP_CHAVE);
          return { imposto: p[0], cst: p[1], motivo: p[2], total: e.total };
        })),
        // Notas (C100) com inconsistência em algum C170, contando todas; mais inconsistências primeiro.
        porNota: Array.from(porNota.values()).map(n => ({
          nf: n.nf, serie: n.serie, data: n.data, operacao: n.operacao, chave: n.chave,
          total: n.total, motivos: Array.from(n.tipos)
        })).sort((a, b) => b.total - a.total)
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
        const ncm = (f[R0200.COD_NCM] || '').trim();
        let e = porNcm.get(ncm);
        if (!e) { e = { descricao: f[R0200.DESCR_ITEM] || '', itens: 0, c170: 0, csts: new Map() }; porNcm.set(ncm, e); }
        e.itens++;
        ncmDoItem.set(item, ncm);
        const motivo = conferirNcm(f[R0200.COD_NCM], cfg.FORMATO_NCM);
        if (motivo) add(linha, '0200', 'COD_NCM', f[R0200.COD_NCM] || '', motivo, item);
      } else if (reg === 'C100') {
        contagem.c100++;
        nota = {
          linha,
          nf: (f[C100.NUM_DOC] || '').trim(), serie: (f[C100.SER] || '').trim(), data: (f[C100.DT_DOC] || '').trim(),
          operacao: (f[C100.IND_OPER] || '').trim(), chave: (f[C100.CHV_NFE] || '').trim()
        };
      } else if (reg === 'C990') {
        nota = null; // fim do bloco C
      } else if (reg === 'C170') {
        contagem.c170++;
        if (!nota) contagem.c170SemC100++;
        const item = f[C170.COD_ITEM] || '';
        const cstIcms = (f[C170.CST_ICMS] || '').trim();
        const eNcm = ncmDoItem.has(item) ? porNcm.get(ncmDoItem.get(item)) : null;
        if (eNcm) { eNcm.c170++; soma(eNcm.csts, cstIcms); }
        const nomeOperacao = nota ? OPERACAO[nota.operacao] : undefined;
        let semOperacao = false;
        if (!itens.has(item)) add(linha, 'C170', 'COD_ITEM', item, 'Item sem cadastro no registro 0200 (NCM não conferida)', item, '', undefined, nota);
        lista.forEach(imp => {
          const cst = (f[C170[imp.cst]] || '').trim();
          const cstLinha = imp.pisCofins ? cst : cstIcms; // valor da coluna CST do CSV
          const bruto = f[C170[imp.base]];
          const motivo = conferirCstFormato(cst, imp.formato);
          if (motivo) { add(linha, 'C170', imp.cst, f[C170[imp.cst]] || '', motivo, item, cstLinha, undefined, nota, imp.nome); return; }
          let esperado = null;
          let tipoOperacao = '';
          if (imp.pisCofins) {
            // Regras validadas pela fiscal da MAC, conforme a operação do C100: CST que não deve ter base
            // (tabela 'sem base') e CST que exige base maior que 0.
            if (!nomeOperacao) { semOperacao = true; return; }
            const op = nota.operacao === '0' ? 'entrada' : 'saida';
            if ((imp.tabela[op] || []).includes(cst)) {
              esperado = 'sem_base_operacao';
              tipoOperacao = 'CST ' + imp.nome + ' de ' + nomeOperacao + ' não deve ter base, mas a base é maior que 0';
            } else if ((cfg.PIS_COFINS_EXIGE_BASE[op] || []).includes(cst)) {
              esperado = 'exige_base_operacao';
              tipoOperacao = 'CST ' + imp.nome + ' de ' + nomeOperacao + ' deve ter base maior que 0, mas a base é 0';
            }
          } else {
            esperado = imp.tabela[cst.slice(-2)];
          }
          if (!esperado) return;
          const base = parseValor(bruto);
          if (Number.isNaN(base)) {
            add(linha, 'C170', imp.base, bruto || '', 'Base de cálculo não é número', item, cstLinha, undefined, nota, imp.nome);
          } else if (esperado === 'sem_base' && base !== 0) {
            add(linha, 'C170', imp.base, bruto, 'CST ' + cst + ' não tributado, mas a base é maior que 0', item, cstLinha, TIPO_NAO_TRIBUTADO, nota, imp.nome);
          } else if (esperado === 'exige_base' && !(base > 0)) {
            add(linha, 'C170', imp.base, bruto || '0', 'CST ' + cst + ' tributado, mas a base é 0', item, cstLinha, TIPO_TRIBUTADO, nota, imp.nome);
          } else if (esperado === 'exige_base_analise' && !(base > 0)) {
            add(linha, 'C170', imp.base, bruto || '0',
              'CST ' + cst + ' deve ter base maior que 0, mas a base é 0: analisar caso a caso (pode ser operação sem base)', item, cstLinha, TIPO_ANALISE, nota, imp.nome);
          } else if (esperado === 'sem_base_operacao' && base > 0) {
            add(linha, 'C170', imp.base, bruto, 'CST ' + imp.nome + ' ' + cst + ' de ' + nomeOperacao + ' não deve ter base, mas a base é ' + bruto.trim(),
              item, cstLinha, tipoOperacao, nota, imp.nome);
          } else if (esperado === 'exige_base_operacao' && !(base > 0)) {
            add(linha, 'C170', imp.base, bruto || '0',
              'CST ' + imp.nome + ' ' + cst + ' de ' + nomeOperacao + ' deve ter base maior que 0, mas a base é 0', item, cstLinha, tipoOperacao, nota, imp.nome);
          }
        });
        if (semOperacao) contagem.pisCofinsSemOperacao++;
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

    // NCMs distintos do 0200 (inclusive vazios e inválidos, como estão), mais C170 primeiro.
    // { ncm, descricao, itens0200, linhasC170, cstIcms: [{ cst, total }] } (cstIcms: mais usado primeiro).
    function listaNcms() {
      return Array.from(porNcm, ([ncm, e]) => ({
        ncm, descricao: e.descricao, itens0200: e.itens, linhasC170: e.c170,
        cstIcms: Array.from(e.csts, ([cst, total]) => ({ cst, total })).sort((a, b) => b.total - a.total || a.cst.localeCompare(b.cst))
      })).sort((a, b) => b.linhasC170 - a.linhasC170 || a.ncm.localeCompare(b.ncm));
    }

    function finish() {
      resto = resto.replace(/\r$/, '');
      if (resto !== '') { feedLine(resto, contagem.linhas + 1); resto = ''; }
      return {
        inconsistencias,
        ncms: listaNcms(),
        total: inconsistencias.length,
        resumo: resumo(),
        linhasLidas: contagem.linhas,
        itensCadastrados: itens.size,
        registros0200: contagem.r0200,
        registrosC170: contagem.c170,
        registrosC100: contagem.c100,
        c170SemC100: contagem.c170SemC100,
        // C170 com CST de PIS/COFINS válido em que a regra não foi aplicada por não se saber a operação (sem C100)
        c170PisCofinsSemOperacao: contagem.pisCofinsSemOperacao,
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

  const CABECALHO_CSV = 'linha;registro;campo;valor;motivo;item;imposto;CST;NF;serie;data;operacao;chave';
  const CABECALHO_CSV_NOTAS = 'NF;serie;data;operacao;chave;quantidade_inconsistencias;motivos';
  const SEP_MOTIVOS = ' | ';

  // Campo de texto: sempre entre aspas duplas, aspas internas dobradas.
  function campoCsv(v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; }

  // Data do C100 (DDMMAAAA) para DD/MM/AAAA, que o Excel não trata como número. Vazia ou inválida fica como está.
  function dataCsv(v) {
    const t = String(v === undefined || v === null ? '' : v);
    const m = /^(\d{2})(\d{2})(\d{4})$/.exec(t);
    if (!m) return t;
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (d.getUTCFullYear() !== +m[3] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[1]) return t;
    return m[1] + '/' + m[2] + '/' + m[3];
  }

  function linhaCsv(i) {
    return i.linha + ';' + campoCsv(i.registro) + ';' + campoCsv(i.campo) + ';' + campoCsv(i.valor) + ';' +
      campoCsv(i.motivo) + ';' + campoCsv(i.item) + ';' + campoCsv(i.imposto) + ';' + campoCsv(i.cst) + ';' +
      campoCsv(i.nf) + ';' + campoCsv(i.serie) + ';' + campoCsv(dataCsv(i.data)) + ';' + campoCsv(i.operacao) + ';' +
      campoCsv(i.chave);
  }

  function linhaCsvNota(n) {
    return campoCsv(n.nf) + ';' + campoCsv(n.serie) + ';' + campoCsv(dataCsv(n.data)) + ';' + campoCsv(n.operacao) + ';' +
      campoCsv(n.chave) + ';' + n.total + ';' + campoCsv((n.motivos || []).join(SEP_MOTIVOS));
  }

  // CSV em partes (strings) para não montar um texto gigante de uma vez:
  // new Blob(partes, { type: 'text/csv;charset=utf-8' }). Separador ";", CRLF, BOM UTF-8 no início
  // (primeira parte), cabeçalho na primeira linha. linhasPorParte é opcional (padrão 5.000).
  function csvPartes(cabecalho, registros, formatar, linhasPorParte) {
    const n = linhasPorParte > 0 ? linhasPorParte : 5000;
    const partes = [];
    let buf = ['﻿' + cabecalho];
    for (let k = 0; k < registros.length; k++) {
      buf.push(formatar(registros[k]));
      if (buf.length >= n) { partes.push(buf.join('\r\n') + '\r\n'); buf = []; }
    }
    if (buf.length) partes.push(buf.join('\r\n') + '\r\n');
    return partes;
  }

  // CSV com TODAS as inconsistências.
  function gerarCsvPartes(inconsistencias, linhasPorParte) {
    return csvPartes(CABECALHO_CSV, inconsistencias, linhaCsv, linhasPorParte);
  }

  function gerarCsv(inconsistencias) { return gerarCsvPartes(inconsistencias).join(''); }

  // Segundo CSV, uma linha por nota (resumo.porNota): NF, serie, data, operacao, chave,
  // quantidade_inconsistencias, motivos (tipos de motivo separados por " | ").
  function gerarCsvNotasPartes(notas, linhasPorParte) {
    return csvPartes(CABECALHO_CSV_NOTAS, notas, linhaCsvNota, linhasPorParte);
  }

  function gerarCsvNotas(notas) { return gerarCsvNotasPartes(notas).join(''); }

  // Terceiro CSV, uma linha por NCM distinto (resultado.ncms), para a fiscal consultar em lote na IOB:
  // ncm, descricao_exemplo, itens_no_0200, linhas_c170, cst_icms_usados ("CST:qtd" separados por " | ").
  // CST de ICMS vazio aparece como "(vazio)".
  const CABECALHO_CSV_NCMS = 'ncm;descricao_exemplo;itens_no_0200;linhas_c170;cst_icms_usados';

  function linhaCsvNcm(n) {
    return campoCsv(n.ncm) + ';' + campoCsv(n.descricao) + ';' + n.itens0200 + ';' + n.linhasC170 + ';' +
      campoCsv((n.cstIcms || []).map(c => (c.cst === '' ? '(vazio)' : c.cst) + ':' + c.total).join(SEP_MOTIVOS));
  }

  function gerarCsvNcmsPartes(ncms, linhasPorParte) {
    return csvPartes(CABECALHO_CSV_NCMS, ncms, linhaCsvNcm, linhasPorParte);
  }

  function gerarCsvNcms(ncms) { return gerarCsvNcmsPartes(ncms).join(''); }

  const api = {
    createChecker, checkText, parseValor, conferirNcm, conferirCstFormato,
    gerarCsvPartes, gerarCsv, gerarCsvNotasPartes, gerarCsvNotas, gerarCsvNcmsPartes, gerarCsvNcms
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Conferencia = api;
})(typeof window !== 'undefined' ? window : this);
