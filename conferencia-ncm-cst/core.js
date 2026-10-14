/*
 * Conferência de NCM e CST sobre o SPED Fiscal (EFD ICMS/IPI). Funções puras, sem acesso a rede.
 * Funciona no navegador (window.Conferencia) e em Node (module.exports).
 *
 * Registros lidos (campos separados por "|", índice 0 é vazio por causa do "|" inicial):
 *   0200 cadastro do item:  [2] COD_ITEM | [8] COD_NCM
 *   C100 nota (NF):         [2] IND_OPER (0 entrada, 1 saída) | [4] COD_PART (consulta o 0150) | [7] SER | [8] NUM_DOC | [9] CHV_NFE | [10] DT_DOC
 *   0150 participante:     [2] COD_PART | [3] NOME | [5] CNPJ | [6] CPF
 *   0450 informação complementar: [2] COD_INF | [3] TXT
 *   C110 informação complementar da nota: [2] COD_INF (consulta o 0450) | [3] TXT_COMPL
 *   C170 item da nota:     [2] NUM_ITEM | [3] COD_ITEM | [10] CST_ICMS | [11] CFOP | [13] VL_BC_ICMS
 *                           [25] CST_PIS | [26] VL_BC_PIS | [27] ALIQ_PIS | [30] VL_PIS
 *                           [31] CST_COFINS | [32] VL_BC_COFINS | [33] ALIQ_COFINS | [36] VL_COFINS
 *
 * No arquivo, o C100 (a nota) vem seguido dos seus C170 (itens): o C100 corrente vale para os C170 seguintes
 * até o próximo C100 (ou o fim do bloco C, C990). Os C110 da nota vêm entre o C100 e os C170 e o 0450 vem no bloco 0,
 * antes das notas, então o texto do C110 é resolvido na hora, sem segunda passada. C170 sem C100 antes fica com os campos da nota vazios.
 *
 * O arquivo pode passar de 80 MB: use createChecker() e alimente em blocos (feedChunk). Só guarda os
 * códigos de item do 0200 e a lista de inconsistências, nunca o texto inteiro.
 */
(function (root) {
  'use strict';

  const Config = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.ConferenciaConfig;

  const R0200 = { COD_ITEM: 2, DESCR_ITEM: 3, COD_NCM: 8 };
  const R0150 = { COD_PART: 2, NOME: 3, CNPJ: 5, CPF: 6 };
  const R0450 = { COD_INF: 2, TXT: 3 };
  const C110 = { COD_INF: 2, TXT_COMPL: 3 };
  const C100 = { IND_OPER: 2, COD_PART: 4, SER: 7, NUM_DOC: 8, CHV_NFE: 9, DT_DOC: 10 };
  const C170 = {
    COD_ITEM: 3, CST_ICMS: 10, CFOP: 11, VL_BC_ICMS: 13,
    CST_PIS: 25, VL_BC_PIS: 26, ALIQ_PIS: 27, VL_PIS: 30,
    CST_COFINS: 31, VL_BC_COFINS: 32, ALIQ_COFINS: 33, VL_COFINS: 36
  };

  // Impostos conferidos no C170: campo do CST, campo da base, formato e tabela de base.
  function impostos(cfg) {
    return [
      { cst: 'CST_ICMS', base: 'VL_BC_ICMS', nome: 'ICMS', formato: cfg.FORMATO_CST_ICMS, tabela: cfg.BASE_POR_CST_ICMS },
      { cst: 'CST_PIS', base: 'VL_BC_PIS', aliq: 'ALIQ_PIS', valor: 'VL_PIS', nome: 'PIS', pisCofins: true, formato: cfg.FORMATO_CST_PIS_COFINS, tabela: cfg.BASE_POR_CST_PIS_COFINS },
      { cst: 'CST_COFINS', base: 'VL_BC_COFINS', aliq: 'ALIQ_COFINS', valor: 'VL_COFINS', nome: 'COFINS', pisCofins: true, formato: cfg.FORMATO_CST_PIS_COFINS, tabela: cfg.BASE_POR_CST_PIS_COFINS }
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

  // ICMS com CST final 90: a regra depende do CFOP do C170.
  const TIPO_90_SEM_BASE = 'CST 90 com CFOP de uso/consumo/ativo não deveria ter base, mas a base é maior que 0';
  const TIPO_90_TRIBUTADO = 'CST 90 deveria ser tributado pelo CFOP, mas a base é 0';

  // ICMS em CFOP sem base (5152, 5929), para qualquer CST.
  const TIPO_CFOP_SEM_BASE = 'CFOP 5152/5929 não deveria ter base de ICMS, mas a base é > 0';

  // ICMS com CST final 90 de entrada e base 0, sem crédito de ICMS do Simples Nacional no C110/0450: não é erro
  // automático; vai para o bloco "a conferir no XML (STR)", por fornecedor.
  const MOTIVO_SEM_C110 = 'sem C110';
  const MOTIVO_C110_SEM_CREDITO = 'C110 sem texto de crédito';
  const AVISO_CONFERIR_XML = 'CST 090 de entrada com base 0 sem crédito de ICMS informado no C110/0450: confira no XML se o fornecedor do Simples ' +
    'tem direito a crédito; se não tiver, o CST 090 sem base está correto.';
  // Quantas NFs aparecem na coluna "notas" do CSV por fornecedor (o resto vira "… (+N)").
  const MAX_NOTAS_CONFERIR = 50;

  // Texto sem acento e em maiúsculas, para casar o padrão de crédito de ICMS.
  function normalizarTexto(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }

  // CST de alíquota zero de PIS/COFINS: a mensagem do motivo mostra a alíquota e o valor do imposto preenchidos.
  const CST_ALIQUOTA_ZERO = '06';

  const SEP_CHAVE ='\u0000';
  const SEP_MOTIVOS = ' | ';
  const NCMS_NO_RANKING = 30;

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
  // aliquota e valor_imposto (ALIQ_ e VL_ do PIS ou COFINS, como estão no C170): só nas inconsistências de base de
  // CST 06 (alíquota zero); vazios nas demais.
  // cfop (CFOP do C170, como está no arquivo): em toda inconsistência de C170; vazio nas do 0200.
  // ncm (COD_NCM) e descricao (DESCR_ITEM) vêm do 0200 do COD_ITEM, só nas inconsistências do C170; vazios
  // quando o item não tem 0200 e nas inconsistências do próprio 0200.
  function createChecker(options) {
    const cfg = Object.assign({}, Config, (options && options.config) || {});
    const lista = impostos(cfg);
    const itens = new Set();
    const infoItem = new Map();  // COD_ITEM -> { ncm (chave do mapa por NCM), descricao } do último 0200 do item
    const porNcm = new Map();    // NCM como está no 0200 -> { descricao, itens, c170, csts: Map }
    const incPorNcm = new Map(); // NCM -> { total, quebra: Map(imposto + CST -> total) }; só inconsistências de C170 com item no 0200
    const inconsistencias = [];
    const porCst = new Map();
    const porMotivo = new Map();
    const porCstMotivo = new Map();
    const porNota = new Map(); // chave = linha do C100; só notas com inconsistência
    const contagem = { linhas: 0, r0200: 0, c170: 0, c100: 0, c170SemC100: 0, pisCofinsSemOperacao: 0 };
    const textos0450 = new Map(); // COD_INF -> TXT do 0450
    const participantes = new Map(); // COD_PART do 0150 -> { nome, cnpj, cpf }
    const conferirXml = new Map(); // fornecedor (CNPJ, CPF ou COD_PART) -> { nome, cnpj, cpf, itens, notas: Map(linha do C100 -> NF), cfops: Set, motivos: Set }
    let nota = null; // C100 corrente: { linha, nf, serie, data, operacao, chave }
    let notaC110 = { tem: false, textos: [] }; // C110 da nota corrente: textos do 0450 consultado e TXT_COMPL
    let creditoSimples = 0; // itens de CST 90 de entrada, base 0, aceitos por trazerem o crédito no C110/0450
    let itensConferirXml = 0; // itens de CST 90 de entrada, base 0, sem crédito informado: a conferir no XML
    let cst051Aceitos = 0; // itens de CST 51 com base 0 aceitos (entrada de produtor rural com CPF no 0150; saída de sucata, CFOP 5102)
    let resto = '';
    let cfopC170 = ''; // CFOP do C170 em conferência, gravado em cada inconsistência dele

    function soma(mapa, chave) { mapa.set(chave, (mapa.get(chave) || 0) + 1); }

    // tipo = motivo sem o texto variável; o resumo conta todas as inconsistências, não só as exibidas.
    function add(linha, registro, campo, valor, motivo, item, cst, tipo, daNota, imposto, aliquota, valorImposto) {
      cst = cst || '';
      imposto = imposto || '';
      aliquota = aliquota || '';
      valorImposto = valorImposto || '';
      tipo = tipo || motivo;
      const ctx = daNota || CAMPOS_NOTA_VAZIOS;
      const produto = registro === 'C170' ? infoItem.get(item) : undefined;
      inconsistencias.push({
        linha, registro, campo, valor: valor === undefined ? '' : valor, motivo, item, imposto, cst,
        aliquota, valor_imposto: valorImposto, cfop: registro === 'C170' ? cfopC170 : '',
        nf: ctx.nf, serie: ctx.serie, data: ctx.data, operacao: ctx.operacao, chave: ctx.chave,
        ncm: produto ? produto.ncm : '', descricao: produto ? produto.descricao : ''
      });
      if (produto) {
        let e = incPorNcm.get(produto.ncm);
        if (!e) { e = { total: 0, quebra: new Map() }; incPorNcm.set(produto.ncm, e); }
        e.total++;
        soma(e.quebra, imposto + SEP_CHAVE + cst);
      }
      if (daNota) {
        let n = porNota.get(daNota.linha);
        if (!n) {
          n = { nf: ctx.nf, serie: ctx.serie, data: ctx.data, operacao: ctx.operacao, chave: ctx.chave, total: 0, base: 0, tipos: new Set() };
          porNota.set(daNota.linha, n);
        }
        n.total++;
        n.tipos.add(tipo);
        // Base envolvida: soma das bases (maiores que 0) das inconsistências de base da nota; desempate da prioridade.
        if (/^VL_BC_/.test(campo)) { const b = parseValor(valor); if (b > 0) n.base += b; }
      }
      soma(porCst, imposto + SEP_CHAVE + cst);
      soma(porMotivo, tipo);
      soma(porCstMotivo, imposto + SEP_CHAVE + cst + SEP_CHAVE + tipo);
    }

    // Os NCMs com mais inconsistências (todas contam), mais inconsistências primeiro, empate pelo NCM.
    // quebra: "ICMS 051:12 | ICMS 000:3" (CST vazio aparece como "(vazio)").
    function rankingNcms() {
      return Array.from(incPorNcm, ([ncm, e]) => ({ ncm, e })).sort((a, b) => b.e.total - a.e.total || a.ncm.localeCompare(b.ncm))
        .slice(0, NCMS_NO_RANKING).map(({ ncm, e }) => {
          const quebraLista = ordenar(Array.from(e.quebra, ([k, total]) => {
            const p = k.split(SEP_CHAVE);
            return { imposto: p[0], cst: p[1], total };
          }));
          return {
            ncm, descricao: porNcm.get(ncm).descricao, total: e.total, quebraLista,
            quebra: quebraLista.map(q => q.imposto + ' ' + (q.cst === '' ? '(vazio)' : q.cst) + ':' + q.total).join(SEP_MOTIVOS)
          };
        });
    }

    // CST 090 de entrada, base 0, sem crédito informado: agrupa por fornecedor (participante da nota no 0150).
    function registrarConferirXml(motivo) {
      const cod = nota ? nota.codPart : '';
      const p = participantes.get(cod) || { nome: '', cnpj: '', cpf: '' };
      const chave = p.cnpj || p.cpf || ('COD:' + cod);
      let e = conferirXml.get(chave);
      if (!e) { e = { nome: p.nome, cnpj: p.cnpj, cpf: p.cpf, itens: 0, notas: new Map(), cfops: new Set(), motivos: new Set() }; conferirXml.set(chave, e); }
      e.itens++;
      if (nota) e.notas.set(nota.linha, nota.nf);
      e.cfops.add(cfopC170);
      e.motivos.add(motivo);
      itensConferirXml++;
    }

    // Fornecedores a conferir no XML, mais itens primeiro (empate pelo nome).
    function listaConferirXml() {
      return Array.from(conferirXml.values()).map(e => {
        const nfs = Array.from(new Set(e.notas.values()));
        const notas = nfs.length > MAX_NOTAS_CONFERIR ? nfs.slice(0, MAX_NOTAS_CONFERIR).join(', ') + ', … (+' + (nfs.length - MAX_NOTAS_CONFERIR) + ')' : nfs.join(', ');
        return {
          fornecedor: e.nome, cnpj: e.cnpj, cpf: e.cpf, qtdNotas: e.notas.size, qtdItens: e.itens,
          cfops: Array.from(e.cfops).sort().join(', '), motivo: Array.from(e.motivos).join(SEP_MOTIVOS), notas
        };
      }).sort((a, b) => b.qtdItens - a.qtdItens || a.fornecedor.localeCompare(b.fornecedor) || a.cnpj.localeCompare(b.cnpj));
    }

    function resumo() {
      const lista = mapa => Array.from(mapa, ([k, total]) => ({ k, total }));
      const fornecedoresConferir = listaConferirXml();
      return {
        total: inconsistencias.length,
        // Informativo, fora do total: itens de CST 51 com base 0 aceitos (entrada de produtor rural, com CPF no 0150,
        // e saída de sucata NCM 4707 com CFOP 5102, diferimento total). Não entram nas inconsistências nem no CSV.
        cst051Aceitos,
        // Fora do total e do CSV de inconsistências: CST 90 de entrada com base 0 sem crédito informado no C110/0450.
        // O operador confere no XML se o fornecedor do Simples tem direito a crédito.
        conferirXml: {
          aviso: AVISO_CONFERIR_XML,
          totalItens: itensConferirXml,
          totalNotas: fornecedoresConferir.reduce((s, f) => s + f.qtdNotas, 0),
          fornecedores: fornecedoresConferir
        },
        // Informativo, fora do total: itens de CST 90 de entrada com base 0 aceitos por terem o crédito de ICMS do
        // Simples Nacional informado no C110/0450. Não entram nas inconsistências nem no CSV.
        cst90CreditoSimples: creditoSimples,
        // NCMs com mais inconsistências (até 30) e o total de NCMs distintos com inconsistência.
        ncmsTop: rankingNcms(),
        totalNcmsComInconsistencia: incPorNcm.size,
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
        // Notas (C100) com inconsistência em algum C170, contando todas (o CSV por nota traz todas), por prioridade:
        // mais inconsistências, depois maior base envolvida, depois NF/série (ordem estável).
        porNota: Array.from(porNota.values()).map(n => ({
          nf: n.nf, serie: n.serie, data: n.data, operacao: n.operacao, chave: n.chave,
          total: n.total, baseEnvolvida: Math.round(n.base * 100) / 100, motivos: Array.from(n.tipos)
        })).sort((a, b) => b.total - a.total || b.baseEnvolvida - a.baseEnvolvida ||
          a.nf.localeCompare(b.nf, undefined, { numeric: true }) || a.serie.localeCompare(b.serie)),
        // Para a tela mostrar "N de TOTAL": notas com inconsistência e inconsistências que caem em notas.
        totalNotasComInconsistencia: porNota.size,
        totalInconsistenciasEmNotas: Array.from(porNota.values()).reduce((s, n) => s + n.total, 0)
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
        infoItem.set(item, { ncm, descricao: f[R0200.DESCR_ITEM] || '' });
        const motivo = conferirNcm(f[R0200.COD_NCM], cfg.FORMATO_NCM);
        if (motivo) add(linha, '0200', 'COD_NCM', f[R0200.COD_NCM] || '', motivo, item);
      } else if (reg === '0150') {
        participantes.set((f[R0150.COD_PART] || '').trim(), { nome: (f[R0150.NOME] || '').trim(), cnpj: (f[R0150.CNPJ] || '').trim(), cpf: (f[R0150.CPF] || '').trim() });
      } else if (reg === '0450') {
        textos0450.set((f[R0450.COD_INF] || '').trim(), f[R0450.TXT] || '');
      } else if (reg === 'C110') {
        notaC110.tem = true;
        const txt0450 = textos0450.get((f[C110.COD_INF] || '').trim());
        if (txt0450) notaC110.textos.push(txt0450);
        if (f[C110.TXT_COMPL]) notaC110.textos.push(f[C110.TXT_COMPL]);
      } else if (reg === 'C100') {
        contagem.c100++;
        notaC110 = { tem: false, textos: [] };
        nota = {
          linha, codPart: (f[C100.COD_PART] || '').trim(),
          nf: (f[C100.NUM_DOC] || '').trim(), serie: (f[C100.SER] || '').trim(), data: (f[C100.DT_DOC] || '').trim(),
          operacao: (f[C100.IND_OPER] || '').trim(), chave: (f[C100.CHV_NFE] || '').trim()
        };
      } else if (reg === 'C990') {
        nota = null; // fim do bloco C
        notaC110 = { tem: false, textos: [] };
      } else if (reg === 'C170') {
        contagem.c170++;
        if (!nota) contagem.c170SemC100++;
        const item = f[C170.COD_ITEM] || '';
        const cstIcms = (f[C170.CST_ICMS] || '').trim();
        cfopC170 = (f[C170.CFOP] || '').trim();
        const eNcm = infoItem.has(item) ? porNcm.get(infoItem.get(item).ncm) : null;
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
            // CFOP sem base de ICMS vale para qualquer CST (inclusive os fora da tabela).
            if (cfg.CFOPS_ICMS_SEM_BASE.includes(cfopC170)) esperado = 'cfop_sem_base';
            // Devolução de compra com ST (5411) com CST final 10 pode ter base própria (espelha a nota de compra).
            else if (esperado === 'sem_base' && cst.slice(-2) === '10' && cfg.CFOPS_DEVOLUCAO_COM_BASE.includes(cfopC170)) esperado = null;
          }
          if (!esperado) return;
          const base = parseValor(bruto);
          if (Number.isNaN(base)) {
            add(linha, 'C170', imp.base, bruto || '', 'Base de cálculo não é número', item, cstLinha, undefined, nota, imp.nome);
          } else if (esperado === 'cfop_sem_base') {
            if (base > 0) add(linha, 'C170', imp.base, bruto, 'CFOP ' + cfopC170 + ' não deveria ter base de ICMS, mas a base é ' + bruto.trim(), item, cstLinha, TIPO_CFOP_SEM_BASE, nota, imp.nome);
          } else if (esperado === 'sem_base' && base !== 0) {
            add(linha, 'C170', imp.base, bruto, 'CST ' + cst + ' não tributado, mas a base é maior que 0', item, cstLinha, TIPO_NAO_TRIBUTADO, nota, imp.nome);
          } else if (esperado === 'exige_base' && !(base > 0)) {
            add(linha, 'C170', imp.base, bruto || '0', 'CST ' + cst + ' tributado, mas a base é 0', item, cstLinha, TIPO_TRIBUTADO, nota, imp.nome);
          } else if (esperado === 'por_cfop_90') {
            // Validado pela fiscal: CFOP de uso/consumo/ativo não tem base; qualquer outro CFOP deve ter.
            const cfopLabel = cfopC170 || '(vazio)';
            if (cfg.CFOPS_ICMS_90_SEM_BASE.includes(cfopC170)) {
              if (base > 0) add(linha, 'C170', imp.base, bruto, 'CST ' + cst + ' com CFOP ' + cfopLabel + ' não deveria ter base', item, cstLinha, TIPO_90_SEM_BASE, nota, imp.nome);
            } else if (!(base > 0)) {
              if (/^[123]/.test(cfopC170)) {
                // Entrada: fornecedor do Simples Nacional informa o crédito no texto complementar, não no C170.
                if (notaC110.textos.some(t => cfg.PADRAO_CREDITO_ICMS_SIMPLES.test(normalizarTexto(t)))) {
                  creditoSimples++;
                } else {
                  registrarConferirXml(notaC110.tem ? MOTIVO_C110_SEM_CREDITO : MOTIVO_SEM_C110);
                }
              } else {
                add(linha, 'C170', imp.base, bruto || '0', 'CST ' + cst + ' com CFOP ' + cfopLabel + ' deveria ser tributado, mas a base é 0', item, cstLinha, TIPO_90_TRIBUTADO, nota, imp.nome);
              }
            }
          } else if (esperado === 'exige_base_analise' && !(base > 0)) {
            // Validado pela fiscal Daniela (14/10/2026): base 0 é correta na entrada de produtor rural (0150 com CPF no
            // lugar do CNPJ, que não tributa) e na saída de sucata (NCM 4707) com CFOP 5102 (diferimento total).
            if (cst.slice(-2) === '51' && nota) {
              const p = nota.operacao === '0' ? participantes.get(nota.codPart) : null;
              const ncm = infoItem.has(item) ? infoItem.get(item).ncm : '';
              if ((p && p.cpf !== '' && p.cnpj === '') ||
                  (nota.operacao === '1' && cfopC170 === cfg.SUCATA_CFOP_SAIDA && ncm.startsWith(cfg.SUCATA_NCM_PREFIXO))) { cst051Aceitos++; return; }
            }
            add(linha, 'C170', imp.base, bruto || '0',
              'CST ' + cst + ' deve ter base maior que 0, mas a base é 0: analisar caso a caso (pode ser operação sem base)', item, cstLinha, TIPO_ANALISE, nota, imp.nome);
          } else if (esperado === 'sem_base_operacao' && base > 0) {
            let motivoBase = 'CST ' + imp.nome + ' ' + cst + ' de ' + nomeOperacao + ' não deve ter base, mas a base é ' + bruto.trim();
            let aliquota = '', valorImposto = '';
            if (cst === CST_ALIQUOTA_ZERO) {
              // Só com valor do imposto > 0 a mensagem fala em imposto preenchido; o tipo (e a contagem do resumo) não muda.
              aliquota = (f[C170[imp.aliq]] || '').trim();
              valorImposto = (f[C170[imp.valor]] || '').trim();
              if (parseValor(valorImposto) > 0) {
                motivoBase = 'CST 06 (alíquota zero) com base > 0 e alíquota ' + (aliquota || '0') + '% / valor R$ ' + valorImposto + ' de ' + imp.nome +
                  ' preenchidos: CST de alíquota zero não deveria ter base nem imposto';
              }
            }
            add(linha, 'C170', imp.base, bruto, motivoBase, item, cstLinha, tipoOperacao, nota, imp.nome, aliquota, valorImposto);
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
        inconsistencias: incPorNcm.has(ncm) ? incPorNcm.get(ncm).total : 0,
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

  const CABECALHO_CSV = 'linha;registro;campo;valor;motivo;item;imposto;CST;NF;serie;data;operacao;chave;ncm;descricao;aliquota;valor_imposto;cfop';
  const CABECALHO_CSV_NOTAS = 'NF;serie;data;operacao;chave;quantidade_inconsistencias;motivos';

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
      campoCsv(i.chave) + ';' + campoCsv(i.ncm) + ';' + campoCsv(i.descricao) + ';' +
      campoCsv(i.aliquota) + ';' + campoCsv(i.valor_imposto) + ';' + campoCsv(i.cfop);
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
  // ncm, descricao_exemplo, itens_no_0200, linhas_c170, cst_icms_usados ("CST:qtd" separados por " | "),
  // inconsistencias (total de inconsistências de C170 dos itens do NCM).
  // CST de ICMS vazio aparece como "(vazio)".
  const CABECALHO_CSV_NCMS = 'ncm;descricao_exemplo;itens_no_0200;linhas_c170;cst_icms_usados;inconsistencias';

  function linhaCsvNcm(n) {
    return campoCsv(n.ncm) + ';' + campoCsv(n.descricao) + ';' + n.itens0200 + ';' + n.linhasC170 + ';' +
      campoCsv((n.cstIcms || []).map(c => (c.cst === '' ? '(vazio)' : c.cst) + ':' + c.total).join(SEP_MOTIVOS)) + ';' + (n.inconsistencias || 0);
  }

  function gerarCsvNcmsPartes(ncms, linhasPorParte) {
    return csvPartes(CABECALHO_CSV_NCMS, ncms, linhaCsvNcm, linhasPorParte);
  }

  function gerarCsvNcms(ncms) { return gerarCsvNcmsPartes(ncms).join(''); }

  // Quarto CSV, uma linha por fornecedor a conferir no XML (resumo.conferirXml.fornecedores, já por qtd_itens desc).
  const CABECALHO_CSV_CONFERIR_XML = 'fornecedor;cnpj;cpf;qtd_notas;qtd_itens;cfops;motivo;notas';

  function linhaCsvConferirXml(f) {
    return campoCsv(f.fornecedor) + ';' + campoCsv(f.cnpj) + ';' + campoCsv(f.cpf) + ';' + f.qtdNotas + ';' + f.qtdItens + ';' +
      campoCsv(f.cfops) + ';' + campoCsv(f.motivo) + ';' + campoCsv(f.notas);
  }

  function gerarCsvConferirXmlPartes(fornecedores, linhasPorParte) {
    return csvPartes(CABECALHO_CSV_CONFERIR_XML, fornecedores, linhaCsvConferirXml, linhasPorParte);
  }

  function gerarCsvConferirXml(fornecedores) { return gerarCsvConferirXmlPartes(fornecedores).join(''); }

  const api = {
    createChecker, checkText, parseValor, conferirNcm, conferirCstFormato,
    gerarCsvPartes, gerarCsv, gerarCsvNotasPartes, gerarCsvNotas, gerarCsvNcmsPartes, gerarCsvNcms,
    gerarCsvConferirXmlPartes, gerarCsvConferirXml
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Conferencia = api;
})(typeof window !== 'undefined' ? window : this);
