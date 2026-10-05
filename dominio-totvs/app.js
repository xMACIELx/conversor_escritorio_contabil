(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = { name: null, text: null, encoding: null, result: null };

  function options() {
    return { removeAccents: $('opt-accents').checked, mapCcusto: $('opt-ccusto').checked };
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderCounts(table, rows) {
    table.textContent = '';
    rows.forEach(r => {
      const tr = el('tr');
      tr.append(el('td', null, r.key), el('td', 'num', String(r.count)));
      table.append(tr);
    });
  }

  function render() {
    if (state.text === null) return;
    const res = Conversor.convertText(state.text, options());
    state.result = res;
    $('result').hidden = false;

    const banner = $('banner');
    banner.className = 'banner ' + (res.hasErrors ? 'bad' : 'good');
    banner.textContent = res.hasErrors
      ? 'Atenção: há problemas neste arquivo. Revise os itens em vermelho antes de enviar para a TOTVS.'
      : 'Tudo certo: ' + res.writtenCount + ' linhas convertidas e todas as conferências passaram.';

    const list = $('checks');
    list.textContent = '';
    res.checks.forEach(c => {
      const li = el('li', c.ok ? 'ok' : 'err');
      li.append(el('span', 'mark', c.ok ? '✓' : '✕'));
      const body = el('div');
      body.append(el('strong', null, c.label), el('span', 'detail', c.detail));
      li.append(body);
      list.append(li);
    });
    const lay = el('li', 'info');
    lay.append(el('span', 'mark', 'i'));
    const lb = el('div');
    lb.append(el('strong', null, 'Layout detectado: ' + res.layoutLabel));
    lay.append(lb);
    list.append(lay);
    const extra = el('li', 'info');
    extra.append(el('span', 'mark', 'i'));
    const eb = el('div');
    eb.append(el('strong', null, 'Leitura do arquivo'),
      el('span', 'detail', 'Codificação detectada: ' + state.encoding + '. Gravação em Windows-1252. ' +
        (options().mapCcusto ? res.ccustoChanged + ' linha(s) com CCUSTO00001 trocadas por CCUSTO01100.' : 'CCUSTO mantido como veio.')));
    extra.append(eb);
    list.append(extra);

    renderCounts($('t-comp'), res.competencias);
    renderCounts($('t-date'), res.datas);
    $('preview').textContent = res.outputLines.slice(0, 10).join('\n');
    $('download-note').textContent = '';
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dec = Conversor.decodeBuffer(reader.result);
      state.name = file.name;
      state.text = dec.text;
      state.encoding = dec.encoding;
      $('drop-main').textContent = file.name;
      $('drop-sub').textContent = 'Clique ou arraste outro arquivo para trocar';
      render();
    };
    reader.readAsArrayBuffer(file);
  }

  function download() {
    const res = state.result;
    if (!res) return;
    if (res.hasErrors) {
      const ok = window.confirm('Existem avisos em vermelho neste arquivo.\n\nBaixar mesmo assim?');
      if (!ok) return;
    }
    const bytes = Conversor.encodeWindows1252(res.outputText);
    const blob = new Blob([bytes], { type: 'text/plain;charset=windows-1252' });
    const outName = state.name.replace(/\.[^.]*$/, '') + '_TOTVS.txt';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = outName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $('download-note').textContent = 'Arquivo gerado: ' + outName;
  }

  const drop = $('drop');
  $('file').addEventListener('change', e => loadFile(e.target.files[0]));
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
  // Soltar fora da área não deve abrir o arquivo no navegador
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
  $('opt-accents').addEventListener('change', render);
  $('opt-ccusto').addEventListener('change', render);
  $('download').addEventListener('click', download);
})();
