(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const CHUNK_BYTES = 4 * 1024 * 1024;
  // Acima disso a tabela mostra só as primeiras linhas; o total continua exato no resumo.
  const MAX_ROWS = 2000;
  // A lista de notas do resumo também é limitada na tela; o CSV por nota traz todas.
  const MAX_NOTAS = 200;
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

    const body = $('incons-body');
    body.textContent = '';
    res.inconsistencias.slice(0, MAX_ROWS).forEach(i => {
      const tr = el('tr');
      tr.append(el('td', 'num', String(i.linha)), el('td', null, i.registro), el('td', null, i.campo),
        el('td', 'val', i.valor === '' ? '(vazio)' : i.valor), el('td', null, i.motivo), el('td', null, i.item || '—'),
        el('td', null, i.imposto || '—'), el('td', null, i.cst || '—'), el('td', null, i.nf || '—'), el('td', null, i.serie || '—'),
        el('td', null, fmtData(i.data)), el('td', null, fmtOperacao(i.operacao)));
      body.append(tr);
    });
    $('table-wrap').hidden = res.total === 0;
    const tr = $('truncated');
    tr.hidden = res.total <= MAX_ROWS;
    tr.textContent = 'Mostrando as primeiras ' + fmt(MAX_ROWS) + ' de ' + fmt(res.total) +
      ' inconsistências. O CSV traz todas.';

    renderResumo(res.resumo);
    renderNotas(res.resumo.porNota);
    current = { inconsistencias: res.inconsistencias, notas: res.resumo.porNota, name };
    $('csv-bar').hidden = res.total === 0;
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

  // Contagens do core, sobre todas as inconsistências (não só as 2.000 exibidas).
  function renderResumo(r) {
    $('resumo-cst').hidden = r.total === 0;
    $('resumo-total').textContent = 'Total: ' + fmt(r.total) + ' inconsistência(s).';
    fillRows('resumo-cst-body', r.porCst.map(e => [(e.imposto ? e.imposto + ' ' : '') + (e.cst || '(sem CST)'), e.total]));
    fillRows('resumo-motivo-body', r.porMotivo.map(e => [e.motivo, e.total]));
  }

  // Notas (C100) com inconsistência: total e lista limitada a MAX_NOTAS, mais inconsistências primeiro.
  function renderNotas(notas) {
    $('resumo-notas').hidden = notas.length === 0;
    $('notas-total').textContent = 'Total: ' + fmt(notas.length) + ' nota(s) com inconsistência.';
    const body = $('notas-body');
    body.textContent = '';
    notas.slice(0, MAX_NOTAS).forEach(n => {
      const tr = el('tr');
      tr.append(el('td', null, n.nf || '—'), el('td', null, n.serie || '—'), el('td', null, fmtData(n.data)),
        el('td', null, fmtOperacao(n.operacao)), el('td', 'num', fmt(n.total)));
      body.append(tr);
    });
    const tn = $('notas-truncated');
    tn.hidden = notas.length <= MAX_NOTAS;
    tn.textContent = 'Mostrando as ' + fmt(MAX_NOTAS) + ' notas com mais inconsistências, de ' + fmt(notas.length) +
      '. O CSV por nota traz todas.';
  }

  function downloadCsv() {
    if (!current) return;
    save(Conferencia.gerarCsvPartes(current.inconsistencias), '_inconsistencias.csv', current.inconsistencias.length);
  }

  function downloadCsvNotas() {
    if (!current) return;
    save(Conferencia.gerarCsvNotasPartes(current.notas), '_notas.csv', current.notas.length);
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
