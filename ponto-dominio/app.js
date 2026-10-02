(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const CFG = window.PontoConfig, Core = window.PontoCore, Pdf = window.PontoPdf;

  const state = {
    report: null, pdfName: null,
    xlsBuf: null, xlsName: null,
    decisoes: null, match: null,
    divTexto: { FALTAS: fmtDiv(CFG.DIVISOR_FALTAS_CENT), DSR: fmtDiv(CFG.DIVISOR_DSR_CENT) },
    res: null
  };

  function fmtDiv(c) { return Core.fmtCent(c); }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(node) { node.textContent = ''; }

  // ---------- upload ----------
  function setupDrop(dropId, inputId, handler) {
    const drop = $(dropId), input = $(inputId);
    input.addEventListener('change', () => { if (input.files[0]) handler(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handler(f); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  }

  function showError(msg) { const b = $('load-error'); b.hidden = !msg; b.textContent = msg || ''; }

  function readBuffer(file) {
    return new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => fail(r.error);
      r.readAsArrayBuffer(file);
    });
  }

  async function onPdf(file) {
    showError('');
    $('pdf-main').textContent = file.name; $('pdf-sub').textContent = 'Lendo o relatório...';
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      const buf = await readBuffer(file);
      const lines = await Pdf.extractLines(window.pdfjsLib, new Uint8Array(buf));
      const rep = Pdf.parseReport(lines);
      if (!rep.colaboradores.length) throw new Error('Não encontrei colaboradores neste PDF. É o relatório "Geração de Lançamentos" do ponto?');
      state.report = rep; state.pdfName = file.name;
      $('drop-pdf').classList.add('loaded');
      $('pdf-sub').textContent = rep.colaboradores.length + ' colaboradores, folha ' + (rep.folha || '?') + ', vencimento ' + (rep.vencimento || '?');
      state.decisoes = null;
      refresh();
    } catch (e) {
      state.report = null; $('drop-pdf').classList.remove('loaded');
      $('pdf-sub').textContent = 'ou clique para procurar no computador';
      showError('Não consegui ler o PDF: ' + e.message);
    }
  }

  async function onXls(file) {
    showError('');
    $('xls-main').textContent = file.name; $('xls-sub').textContent = 'Lendo a planilha...';
    try {
      const buf = await readBuffer(file);
      const wb = window.XLSX.read(buf, { type: 'array', cellStyles: true, cellNF: true, cellFormula: true });
      if (!wb.SheetNames.length) throw new Error('A planilha está vazia.');
      const g = Core.lerGrade(window.XLSX, wb.Sheets[wb.SheetNames[0]]);
      if (!g.linhas.length) throw new Error('Não encontrei linhas de colaboradores (coluna A com 11, 41, 42, 51 ou 52). É a planilha padrão da Domínio?');
      state.xlsBuf = buf; state.xlsName = file.name;
      $('drop-xls').classList.add('loaded');
      $('xls-sub').textContent = g.linhas.length + ' colaboradores, empresa ' + g.empresa + (g.competencia ? ', competência ' + g.competencia.mm + '/' + g.competencia.aaaa : '');
      state.decisoes = null;
      refresh();
    } catch (e) {
      state.xlsBuf = null; $('drop-xls').classList.remove('loaded');
      $('xls-sub').textContent = 'ou clique para procurar no computador';
      showError('Não consegui ler a planilha: ' + e.message);
    }
  }

  // ---------- cálculo ----------
  function divisores() {
    const d = {};
    ['FALTAS', 'DSR'].forEach(k => {
      let t = state.divTexto[k].trim();
      if (/^\d+$/.test(t)) t += ',00';
      const c = Pdf.parseCentesimos(t);
      d[k] = c && c > 0 ? c : (k === 'FALTAS' ? CFG.DIVISOR_FALTAS_CENT : CFG.DIVISOR_DSR_CENT);
    });
    return d;
  }

  function carregarPlanilha() {
    const wb = window.XLSX.read(state.xlsBuf, { type: 'array', cellStyles: true, cellNF: true, cellFormula: true });
    return { wb, ws: wb.Sheets[wb.SheetNames[0]] };
  }

  function refresh() {
    if (!state.report || !state.xlsBuf) return;
    const { wb, ws } = carregarPlanilha();
    const grade0 = Core.lerGrade(window.XLSX, ws);
    if (!state.decisoes) {
      state.match = Core.casarColaboradores(state.report.colaboradores, grade0.linhas);
      state.decisoes = state.match.map(m => ({ tipo: m.tipo, row: m.row, confirmado: false, codigoManual: '' }));
      state.grade0 = grade0;
      renderMatching();
    }
    state.grade0 = grade0;
    const tipo = Core.tipoDeFolha(state.report.folha) || (grade0.linhas[0] && grade0.linhas[0].tipo) || 11;
    const plano = Core.construirPlano(state.report, state.decisoes, divisores());
    const ap = Core.aplicarNaPlanilha(window.XLSX, wb, state.report, state.decisoes, plano, tipo);
    const txt = Core.gerarTxt(ap.grade);
    const val = Core.validar({ report: state.report, grade0, plano, decisoes: state.decisoes, ap, txt });
    state.res = { wb, plano, ap, txt, val, grade0 };
    $('review').hidden = false;
    renderResults();
  }

  // ---------- renderização ----------
  function nomeEventos(colab) {
    return Core.agregarEventos(colab).map(a => a.codigo + ' ' + a.descricao + ': ' + Core.fmtCent(a.centesimos) + ' h').join('; ');
  }

  function renderConfig() {
    $('div-faltas').value = state.divTexto.FALTAS;
    $('div-dsr').value = state.divTexto.DSR;
    const t = $('t-map'); clear(t);
    const head = el('tr'); ['Evento do relatório', 'Evento Domínio', 'Unidade'].forEach(h => head.append(el('th', null, h)));
    t.append(head);
    let grupoAtual = null;
    CFG.EVENTOS.forEach(e => {
      if (e.grupo !== grupoAtual) {
        grupoAtual = e.grupo;
        const g = el('tr', 'grupo'), td = el('td', null, CFG.GRUPOS_EVENTOS[e.grupo]);
        td.colSpan = 3; g.append(td); t.append(g);
      }
      const tr = el('tr');
      tr.append(el('td', null, e.origem + ' ' + e.nome), el('td', null, e.evento),
        el('td', null, e.unidade === 'minutos' ? 'minutos' : 'dias (horas ÷ divisor ' + e.divisor + ')'));
      t.append(tr);
    });
  }

  function renderMatching() {
    const rep = state.report;
    const la = $('list-aprox'), ls = $('list-sem');
    clear(la); clear(ls);
    let na = 0, ns = 0;
    rep.colaboradores.forEach((c, i) => {
      const m = state.match[i], d = state.decisoes[i];
      if (m.tipo === 'aprox') {
        na++;
        const it = el('div', 'item');
        const who = el('div', 'who');
        who.append(el('strong', null, c.nome), el('small', null, 'Planilha: ' + m.nomePlanilha + ' (linha ' + m.row + ') — ' + nomeEventos(c)));
        const lab = el('label'); const cb = el('input'); cb.type = 'checkbox';
        cb.addEventListener('change', () => { d.confirmado = cb.checked; refresh(); });
        lab.append(cb, document.createTextNode(' confirmar'));
        it.append(who, lab); la.append(it);
      } else if (m.tipo === 'sem') {
        ns++;
        const it = el('div', 'item');
        const who = el('div', 'who');
        who.append(el('strong', null, c.nome + ' (contrato ' + c.contrato + ')'), el('small', null, m.motivo + ' — ' + nomeEventos(c)));
        const inp = el('input'); inp.type = 'text'; inp.placeholder = 'código folha'; inp.inputMode = 'numeric';
        inp.setAttribute('aria-label', 'Código folha de ' + c.nome);
        inp.addEventListener('input', () => {
          const v = inp.value.trim();
          inp.classList.toggle('invalid', v !== '' && (!/^\d+$/.test(v) || parseInt(v, 10) === 0));
          d.codigoManual = /^\d+$/.test(v) && parseInt(v, 10) > 0 ? v : '';
          refresh();
        });
        it.append(who, inp); ls.append(it);
      }
    });
    $('box-aprox').hidden = !na; $('box-sem').hidden = !ns;
  }

  function copyBtn(btnId, areaId) {
    $(btnId).addEventListener('click', () => {
      const ta = $(areaId); ta.select();
      const done = () => { const b = $(btnId); const t = b.textContent; b.textContent = 'Copiado!'; setTimeout(() => { b.textContent = t; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
  }

  const STATUS = {
    ok: 'OK', naofecha: 'Não fecha dia inteiro — confira', zerou: 'Arredonda para 0 — não entra no arquivo',
    naomapeado: 'Evento sem mapeamento — não entra', pulado: 'Colaborador fora do arquivo', aguardando: 'Aguardando confirmação'
  };

  function renderResults() {
    const r = state.res;
    const temErro = r.val.some(v => v.nivel === 'erro'), temAviso = r.val.some(v => v.nivel === 'aviso');
    const banner = $('banner');
    banner.className = 'banner ' + (temErro ? 'bad' : temAviso ? 'warn' : 'good');
    banner.textContent = r.txt.linhas.length === 0
      ? 'Nenhum lançamento gerado: nada para baixar. Veja os itens em vermelho.'
      : temErro
      ? 'Atenção: há erros em vermelho. Revise antes de importar na Domínio.'
      : temAviso ? 'Quase lá: há avisos em amarelo para você conferir. ' + r.txt.linhas.length + ' lançamentos prontos.'
        : 'Tudo certo: ' + r.txt.linhas.length + ' lançamentos prontos e todas as conferências passaram.';

    const list = $('checks'); clear(list);
    const marcas = { ok: '✓', erro: '✕', aviso: '!', info: 'i' };
    r.val.forEach(v => {
      const li = el('li', v.nivel);
      li.append(el('span', 'mark', marcas[v.nivel]));
      const b = el('div'); b.append(el('strong', null, v.label), el('span', 'detail', v.detail));
      li.append(b); list.append(li);
    });

    // excluídos
    const rep = state.report;
    const excl = [];
    rep.colaboradores.forEach((c, i) => {
      if (!Core.incluido(state.decisoes[i])) {
        const m = state.match[i];
        excl.push(c.nome + ' (contrato ' + c.contrato + ') — ' + (m.tipo === 'aprox' ? 'aguardando confirmação (planilha: ' + m.nomePlanilha + ')' : m.motivo) + ' — ' + nomeEventos(c));
      }
    });
    $('box-excl').hidden = !excl.length; $('txt-excl').value = excl.join('\n');

    // não fecham
    const nf = r.plano.naoFecham.concat(r.plano.zerados.filter(z => r.plano.naoFecham.indexOf(z) < 0)).map(l =>
      l.nome + ' — ' + l.origem + ' ' + l.descricao + ': ' + Core.fmtCent(l.horas) + ' h = ' + Core.fmtCent(l.centDias) + ' dias → entra ' + l.valor + ' dia(s)');
    $('box-fecham').hidden = !nf.length; $('txt-fecham').value = nf.join('\n');

    // tabela
    const t = $('t-conf'); clear(t);
    const head = el('tr');
    [['Colaborador'], ['Evento'], ['Horas (relatório)', 'num'], ['Valor convertido', 'num'], ['Unidade'], ['Status']].forEach(h => head.append(el('th', h[1], h[0])));
    t.append(head);
    const so = $('only-attn').checked;
    r.plano.conferencia.forEach(l => {
      if (so && (l.status === 'ok' || l.status === 'pulado' || l.status === 'aguardando')) return;
      const tr = el('tr', 's-' + l.status);
      tr.append(el('td', null, l.nome), el('td', null, l.origem + ' ' + l.descricao + (l.evento ? ' → ' + l.evento : '')),
        el('td', 'num', Core.fmtCent(l.horas) + ' h'),
        el('td', 'num', l.valor === undefined ? '—' : String(l.valor)),
        el('td', null, l.unidade || '—'),
        el('td', l.status === 'ok' ? 'st-ok' : null, STATUS[l.status]));
      t.append(tr);
    });

    const vazio = r.txt.linhas.length === 0;
    $('dl-xls').disabled = vazio; $('dl-txt').disabled = vazio;
    const aguarda = state.decisoes.some((d, i) => state.match[i].tipo === 'aprox' && !d.confirmado);
    $('dl-note').textContent = vazio ? 'Nenhum lançamento gerado: download desativado.' : r.txt.linhas.length + ' linhas no .txt' + (aguarda ? ' — há nomes parecidos sem confirmar (ficam de fora).' : '.');
  }

  // ---------- download ----------
  function baixar(blob, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  function confirmaSeErro() {
    if (!state.res.val.some(v => v.nivel === 'erro')) return true;
    return window.confirm('Existem erros (em vermelho) no resumo. Baixar mesmo assim?');
  }

  function init() {
    renderConfig();
    setupDrop('drop-pdf', 'file-pdf', onPdf);
    setupDrop('drop-xls', 'file-xls', onXls);
    ['div-faltas', 'div-dsr'].forEach(id => {
      $(id).addEventListener('input', () => {
        const k = id === 'div-faltas' ? 'FALTAS' : 'DSR';
        state.divTexto[k] = $(id).value;
        let t = $(id).value.trim(); if (/^\d+$/.test(t)) t += ',00';
        const c = Pdf.parseCentesimos(t);
        $(id).classList.toggle('invalid', !(c && c > 0));
        refresh();
      });
    });
    $('only-attn').addEventListener('change', () => { if (state.res) renderResults(); });
    copyBtn('copy-excl', 'txt-excl'); copyBtn('copy-fecham', 'txt-fecham');

    $('dl-txt').addEventListener('click', () => {
      if (!state.res || !state.res.txt.linhas.length || !confirmaSeErro()) return;
      const c = state.res.ap.grade.competencia;
      const nome = 'LANCAMENTOS_' + (c ? c.aaaa + c.mm : 'SEMCOMP') + '.txt';
      baixar(new Blob([Core.txtComoTexto(state.res.txt.linhas)], { type: 'text/plain' }), nome);
    });
    $('dl-xls').addEventListener('click', () => {
      if (!state.res || !state.res.txt.linhas.length || !confirmaSeErro()) return;
      const out = window.XLSX.write(state.res.wb, { bookType: 'biff8', type: 'array' });
      const base = (state.xlsName || 'planilha').replace(/\.[^.]+$/, '');
      baixar(new Blob([out], { type: 'application/vnd.ms-excel' }), base + '_preenchida.xls');
    });
  }

  init();
})();
