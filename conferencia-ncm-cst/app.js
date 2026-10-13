(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const CHUNK_BYTES = 4 * 1024 * 1024;
  // Acima disso a tabela mostra só as primeiras linhas; o total continua exato no resumo.
  const MAX_ROWS = 2000;
  let running = false;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fmt(n) {
    return n.toLocaleString('pt-BR');
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
      ' itens no 0200 e ' + fmt(res.registrosC170) + ' itens de nota (C170).';

    const body = $('incons-body');
    body.textContent = '';
    res.inconsistencias.slice(0, MAX_ROWS).forEach(i => {
      const tr = el('tr');
      tr.append(el('td', 'num', String(i.linha)), el('td', null, i.registro), el('td', null, i.campo),
        el('td', 'val', i.valor === '' ? '(vazio)' : i.valor), el('td', null, i.motivo), el('td', null, i.item || '—'));
      body.append(tr);
    });
    $('table-wrap').hidden = res.total === 0;
    const tr = $('truncated');
    tr.hidden = res.total <= MAX_ROWS;
    tr.textContent = 'Mostrando as primeiras ' + fmt(MAX_ROWS) + ' de ' + fmt(res.total) + ' inconsistências.';
  }

  async function run(file) {
    if (!file || running) return;
    running = true;
    $('result').hidden = true;
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
