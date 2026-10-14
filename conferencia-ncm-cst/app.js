(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const CHUNK_BYTES = 4 * 1024 * 1024;
  // A lista de notas do resumo é limitada na tela; o CSV por nota traz todas.
  const MAX_NOTAS = 50;
  // Tamanho máximo da descrição do produto na célula (o title traz o texto inteiro).
  const MAX_DESCRICAO = 40;
  let running = false;
  let current = null; // resultado exibido: base do CSV completo

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fmt(n) {
    return n.toLocaleString('pt-BR');
  }

  // IND_OPER do C100: 0 entrada, 1 saída; sem C100 (ou valor fora disso) fica "—".
  function fmtOperacao(op) {
    return op === '0' ? 'Entrada' : op === '1' ? 'Saída' : '—';
  }

  // DT_DOC vem como DDMMAAAA no SPED; outro formato é mostrado como veio.
  function fmtData(d) {
    if (!d) return '—';
    return /^\d{8}$/.test(d) ? d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4) : d;
  }

  // Descrição longa é cortada na célula; o texto completo fica no title (ao passar o mouse).
  function cortar(texto) {
    return texto.length > MAX_DESCRICAO ? texto.slice(0, MAX_DESCRICAO - 1).trimEnd() + '…' : texto;
  }

  function celulaProduto(descricao) {
    const td = el('td', 'produto', descricao ? cortar(descricao) : '—');
    if (descricao) td.title = descricao;
    return td;
  }

  function setStatus(text, isError) {
    const s = $('status');
    s.textContent = text;
    s.className = 'note' + (isError ? ' error' : '');
  }

  function render(res, name) {
    $('result').hidden = false;
    $('warn-base').hidden = !res.regraBasePendente;

    const banner = $('banner');
    banner.className = 'banner ' + (res.total ? 'bad' : 'good');
    banner.textContent = res.total
      ? 'Atenção: ' + fmt(res.total) + ' inconsistência(s) em ' + name + '.'
      : 'Nenhuma inconsistência encontrada em ' + name + '.';

    $('summary').textContent = fmt(res.linhasLidas) + ' linhas lidas, ' + fmt(res.registros0200) +
      ' itens no 0200 e ' + fmt(res.registrosC170) + ' itens de nota (C170) em ' + fmt(res.registrosC100) + ' nota(s) (C100).' +
      (res.c170PisCofinsSemOperacao ? ' PIS/COFINS não conferido em ' + fmt(res.c170PisCofinsSemOperacao) +
        ' item(ns) sem nota (C100) para indicar a operação.' : '');

    renderResumo(res.resumo);
    renderNcmsTop(res.resumo);
    renderNotas(res.resumo);
    current = { inconsistencias: res.inconsistencias, notas: res.resumo.porNota, ncms: res.ncms, name };
    // O CSV de NCMs vale mesmo sem inconsistências; os outros dois só quando há o que listar.
    $('csv-bar').hidden = false;
    $('csv').hidden = res.total === 0;
    $('csv-notas').hidden = res.total === 0;
    $('csv-ncms').hidden = false;
    $('csv-note').textContent = '';
  }

  function fillRows(id, linhas) {
    const body = $(id);
    body.textContent = '';
    linhas.forEach(([rotulo, total]) => {
      const tr = el('tr');
      tr.append(el('td', null, rotulo), el('td', 'num', fmt(total)));
      body.append(tr);
    });
  }

  // Contagens do core, sobre todas as inconsistências.
  function renderResumo(r) {
    $('resumo-cst').hidden = r.total === 0;
    $('resumo-total').textContent = 'Total: ' + fmt(r.total) + ' inconsistência(s).';
    fillRows('resumo-cst-body', r.porCst.map(e => [(e.imposto ? e.imposto + ' ' : '') + (e.cst || '(sem CST)'), e.total]));
    fillRows('resumo-motivo-body', r.porMotivo.map(e => [e.motivo, e.total]));
  }

  // Ranking do core (até 30 NCMs), para a fiscal consultar na IOB só esses; o total conta todos os NCMs.
  function renderNcmsTop(r) {
    const top = r.ncmsTop || [];
    $('resumo-ncms').hidden = top.length === 0;
    $('ncms-total').textContent = 'Total: ' + fmt(r.totalNcmsComInconsistencia) + ' NCM(s) distinto(s) com inconsistência.' +
      (r.totalNcmsComInconsistencia > top.length ? ' Abaixo, os ' + fmt(top.length) + ' com mais inconsistências.' : '');
    const body = $('ncms-body');
    body.textContent = '';
    top.forEach(n => {
      const tr = el('tr');
      tr.append(el('td', 'val', n.ncm === '' ? '(vazio)' : n.ncm), celulaProduto(n.descricao),
        el('td', 'num', fmt(n.total)), el('td', null, n.quebra));
      body.append(tr);
    });
  }

  // Notas (C100) com inconsistência: o core já ordena por prioridade; a tela mostra as primeiras MAX_NOTAS.
  function renderNotas(r) {
    const notas = r.porNota;
    const total = r.totalNotasComInconsistencia !== undefined ? r.totalNotasComInconsistencia : notas.length;
    $('resumo-notas').hidden = notas.length === 0;
    $('notas-total').textContent = 'Total: ' + fmt(total) + ' nota(s) com inconsistência.';
    const body = $('notas-body');
    body.textContent = '';
    const mostradas = notas.slice(0, MAX_NOTAS);
    mostradas.forEach(n => {
      const tr = el('tr');
      tr.append(el('td', null, n.nf || '—'), el('td', null, n.serie || '—'), el('td', null, fmtData(n.data)),
        el('td', null, fmtOperacao(n.operacao)), el('td', 'num', fmt(n.total)));
      body.append(tr);
    });
    const tn = $('notas-truncated');
    tn.hidden = total <= mostradas.length;
    tn.textContent = 'Mostrando as ' + fmt(mostradas.length) + ' de ' + fmt(total) + ' notas; o CSV traz todas.';
  }

  function downloadCsv() {
    if (!current) return;
    save(Conferencia.gerarCsvPartes(current.inconsistencias), '_inconsistencias.csv', current.inconsistencias.length);
  }

  function downloadCsvNotas() {
    if (!current) return;
    save(Conferencia.gerarCsvNotasPartes(current.notas), '_notas.csv', current.notas.length);
  }

  function downloadCsvNcms() {
    if (!current) return;
    save(Conferencia.gerarCsvNcmsPartes(current.ncms), '_ncms.csv', current.ncms.length);
  }

  function save(partes, sufixo, linhas) {
    const blob = new Blob(partes, { type: 'text/csv;charset=utf-8' });
    const outName = current.name.replace(/\.[^.]*$/, '') + sufixo;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = outName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $('csv-note').textContent = 'Arquivo gerado: ' + outName + ' (' + fmt(linhas) + ' linhas).';
  }

  async function run(file) {
    if (!file || running) return;
    running = true;
    $('result').hidden = true;
    current = null;
    $('drop-main').textContent = file.name;
    $('drop-sub').textContent = 'Clique ou arraste outro arquivo para trocar';
    try {
      // SPED Fiscal vem em Windows-1252/ISO-8859-1; lê em blocos para arquivos grandes.
      const decoder = new TextDecoder('windows-1252');
      const checker = Conferencia.createChecker();
      for (let pos = 0; pos < file.size; pos += CHUNK_BYTES) {
        setStatus('Conferindo… ' + Math.floor(pos * 100 / file.size) + '%', false);
        const buf = await file.slice(pos, pos + CHUNK_BYTES).arrayBuffer();
        checker.feedChunk(decoder.decode(buf, { stream: true }));
        await new Promise(r => setTimeout(r, 0)); // deixa a tela atualizar
      }
      checker.feedChunk(decoder.decode());
      const res = checker.finish();
      if (res.linhasLidas === 0) {
        setStatus('O arquivo está vazio.', true);
      } else if (res.registros0200 === 0 && res.registrosC170 === 0) {
        setStatus('Não encontrei registros 0200 nem C170. Confira se este é o arquivo SPED Fiscal (EFD ICMS/IPI).', true);
      } else {
        setStatus('Conferência concluída.', false);
        render(res, file.name);
      }
    } catch (e) {
      setStatus('Não consegui ler o arquivo: ' + (e && e.message || e), true);
    } finally {
      running = false;
    }
  }

  $('csv').addEventListener('click', downloadCsv);
  $('csv-notas').addEventListener('click', downloadCsvNotas);
  $('csv-ncms').addEventListener('click', downloadCsvNcms);
  const drop = $('drop');
  $('file').addEventListener('change', e => { run(e.target.files[0]); e.target.value = ''; });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => run(e.dataTransfer.files[0]));
  // Soltar fora da área não deve abrir o arquivo no navegador
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
})();
