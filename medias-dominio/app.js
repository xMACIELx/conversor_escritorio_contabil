(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const CFG = window.MediasConfig, Core = window.MediasCore;
  const NOME_ARQUIVO = 'lancar_medias.txt';

  // Códigos que a tela já traz preenchidos (confirmados na tela da Domínio). Chave: cabecalho da coluna.
  // Prêmio e as demais ficam em branco. Valem só a partir da tela: ao gerar, a tabela substitui o config.js.
  const RUBRICAS_INICIAIS = { 'HE 50% (h:mm)': '150', 'Assiduidade (R$)': '236', 'DSR HE (R$)': '250' };

  const state = { xlsxBuf: null, pdfBuf: null, res: null };
  const rubricaInputs = [];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(node) { node.textContent = ''; }
  function tamanho(bytes) { return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB'; }

  // ---------- tabela de rubricas ----------
  function montarRubricas() {
    const corpo = $('rubricas-corpo');
    CFG.COLUNAS.forEach((c, i) => {
      const tr = el('tr');
      tr.append(el('td', null, c.cabecalho), el('td', null, c.tipo === 'horas' ? 'horas (H,MM)' : 'R$'));
      const td = el('td');
      const input = el('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.id = 'rub-' + i;
      input.size = 8;
      input.value = Object.prototype.hasOwnProperty.call(RUBRICAS_INICIAIS, c.cabecalho) ? RUBRICAS_INICIAIS[c.cabecalho] : '';
      input.setAttribute('aria-label', 'Código da rubrica para ' + c.cabecalho);
      input.addEventListener('input', invalidar);
      rubricaInputs.push(input);
      td.append(input);
      tr.append(td);
      corpo.append(tr);
    });
  }

  // ---------- upload ----------
  function setupDrop(dropId, inputId, onFile) {
    const drop = $(dropId), input = $(inputId);
    input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) onFile(f); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  }

  // Guarda o arquivo e mostra nome e tamanho na área de envio. Recusa tipo errado com aviso.
  function carregar(file, tipo) {
    const ok = tipo === 'xlsx' ? /\.xlsx?$/i.test(file.name) : /\.pdf$/i.test(file.name);
    if (!ok) {
      mostrarAviso(tipo === 'xlsx' ? 'Envie a planilha de apuração em .xlsx (ou .xls).' : 'Envie a Relação de Empregados em PDF.');
      return;
    }
    file.arrayBuffer().then(buf => {
      const xlsx = tipo === 'xlsx';
      state[xlsx ? 'xlsxBuf' : 'pdfBuf'] = buf;
      $(xlsx ? 'drop-xlsx' : 'drop-pdf').classList.add('loaded');
      $(xlsx ? 'xlsx-main' : 'pdf-main').textContent = file.name;
      $(xlsx ? 'xlsx-sub' : 'pdf-sub').textContent = tamanho(file.size);
      invalidar();
    });
  }

  // ---------- validação e configuração ----------
  function erros() {
    const lista = [];
    const emp = $('empresa').value.trim();
    if (emp === '') lista.push('Informe o código da empresa na Domínio antes de gerar.');
    else if (!/^\d+$/.test(emp)) lista.push('O código da empresa deve ter só números.');
    CFG.COLUNAS.forEach((c, i) => {
      const r = rubricaInputs[i].value.trim();
      if (r !== '' && !/^\d+$/.test(r)) lista.push('A rubrica de "' + c.cabecalho + '" deve ter só números.');
    });
    if (!state.xlsxBuf) lista.push('Envie a planilha de apuração (.xlsx).');
    if (!state.pdfBuf) lista.push('Envie a Relação de Empregados (PDF).');
    return lista;
  }

  // Copia a tela para a configuração que o core usa (mesmo objeto, no navegador).
  function aplicarConfig() {
    CFG.FORMATO_DATA.separador = $('formato-data').value;
    CFG.COLUNAS.forEach((c, i) => { c.rubrica = rubricaInputs[i].value.trim() || null; });
  }

  // Colunas com valor maior que zero na planilha e sem código na tela (para dizer o nome no bloqueio).
  function colunasSemCodigo(lancamentos) {
    const nomes = new Set();
    lancamentos.forEach(l => l.valores.forEach(v => { if (v.valor > 0 && !v.coluna.rubrica) nomes.add(v.coluna.cabecalho); }));
    return Array.from(nomes);
  }

  // ---------- geração ----------
  function setBusy(on) {
    $('gerar').disabled = on;
    $('gerar').textContent = on ? 'Gerando...' : 'Gerar';
    $('status').textContent = on ? 'Lendo a planilha e a Relação de Empregados...' : '';
  }

  function mostrarAviso(msg) {
    const a = $('aviso');
    a.hidden = !msg;
    a.textContent = msg || '';
  }

  function invalidar() {
    state.res = null;
    $('resultado').hidden = true;
    mostrarAviso('');
  }

  async function gerar() {
    const lista = erros();
    if (lista.length) { invalidar(); mostrarAviso(lista.join(' ')); return; }
    setBusy(true);
    try {
      aplicarConfig();
      const wb = window.XLSX.read(state.xlsxBuf, { type: 'array' });
      const lido = Core.lerLancamentos(window.XLSX, wb);
      const rel = await Core.lerRelacaoPdf(window.pdfjsLib, new Uint8Array(state.pdfBuf.slice(0)));
      const casamento = Core.casarEmpregados(lido.linhas, rel.empregados);
      const pendencias = lido.pendencias.concat(rel.pendencias.map(p => Object.assign({ bloqueia: false }, p)));
      const res = Core.gerarTxt({ empresa: $('empresa').value, lancamentos: lido.linhas, pendencias, casamento });
      state.res = Object.assign(res, { casamento, semCodigo: colunasSemCodigo(lido.linhas) });
      mostrarRelatorio();
    } catch (e) {
      invalidar();
      mostrarAviso('Não consegui gerar o arquivo: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---------- relatório ----------
  const ROTULOS = {
    sem_par: 'Sem código', ambiguo: 'Ambíguo', rubrica_sem_codigo: 'Rubrica sem código', valor_negativo: 'Valor negativo',
    valor_invalido: 'Valor ilegível', competencia_invalida: 'Competência inválida', linha_incompleta: 'Linha incompleta',
    lancamento_repetido: 'Lançamento repetido', cabecalho_ausente: 'Cabeçalho não achado', coluna_ausente: 'Coluna ausente',
    empresa_ausente: 'Empresa vazia', nome_e_cargo_no_mesmo_trecho: 'PDF: nome e cargo juntos', codigo_sem_nome: 'PDF: código sem nome'
  };

  function tabela(id, cabecalhos, linhas, numericas) {
    const t = $(id);
    clear(t);
    const thead = el('thead'), tr = el('tr');
    cabecalhos.forEach((h, i) => { const th = el('th', numericas && numericas.includes(i) ? 'num' : null, h); th.scope = 'col'; tr.append(th); });
    thead.append(tr);
    const tbody = el('tbody');
    linhas.forEach(valores => {
      const row = el('tr');
      valores.forEach((v, i) => row.append(el('td', numericas && numericas.includes(i) ? 'num' : null, v)));
      tbody.append(row);
    });
    t.append(thead, tbody);
  }

  function mostrarRelatorio() {
    const r = state.res;
    const cruzados = [];
    r.casamento.forEach(c => { if (c.tipo === 'exato') cruzados.push(c); });
    const pend = r.pendencias.slice().sort((a, b) => (b.bloqueia ? 1 : 0) - (a.bloqueia ? 1 : 0));
    const bloqueios = pend.filter(p => p.bloqueia).length;
    const naoBloqueiam = pend.length - bloqueios;

    const banner = $('banner');
    if (r.bloqueado) {
      const sem = r.semCodigo.length ? ' Rubrica sem código usada nos dados: ' + r.semCodigo.join(', ') + '.' : '';
      banner.className = 'banner bad';
      banner.textContent = 'Arquivo não gerado: ' + bloqueios + ' pendência(s) bloqueiam a geração.' + sem;
    } else if (naoBloqueiam) {
      banner.className = 'banner warn';
      banner.textContent = 'Arquivo pronto: ' + r.totais.linhas + ' linha(s) para ' + r.totais.empregados + ' empregado(s). ' + naoBloqueiam + ' pendência(s) ficaram de fora; confira abaixo.';
    } else {
      banner.className = 'banner good';
      banner.textContent = 'Arquivo pronto: ' + r.totais.linhas + ' linha(s) para ' + r.totais.empregados + ' empregado(s), sem pendências.';
    }

    const semCodigo = pend.filter(p => p.tipo === 'sem_par').length;
    const ambiguos = pend.filter(p => p.tipo === 'ambiguo').length;
    $('resumo-cruzados').textContent = 'Empregados cruzados: ' + cruzados.length + ' de ' + r.casamento.size + ' nome(s) da planilha.';
    $('resumo-pendencias').textContent = 'Pendências: ' + semCodigo + ' sem código, ' + ambiguos + ' ambíguo(s), ' + (pend.length - semCodigo - ambiguos) + ' outra(s).';
    $('resumo-linhas').textContent = 'Linhas geradas: ' + r.totais.linhas + '.';
    $('n-cruzados').textContent = '(' + cruzados.length + ')';
    $('n-pendencias').textContent = '(' + pend.length + ')';

    tabela('t-cruzados', ['Nome na planilha', 'Código na Domínio'], cruzados.map(c => [c.nome, c.codigo]));
    tabela('t-pendencias', ['Situação', 'Nome', 'Linha', 'Detalhe'],
      pend.length ? pend.map(p => [(p.bloqueia ? 'Bloqueia: ' : '') + (ROTULOS[p.tipo] || p.tipo), p.nome || '', p.linha || '', p.detalhe || '']) : [['Nenhuma pendência.', '', '', '']]);
    tabela('t-totais', ['Rubrica', 'Lançamento', 'Linhas', 'Total'],
      r.totais.porRubrica.map(t => [t.rubrica, t.descricao, String(t.linhas), t.unidade === 'horas' ? Core.fmtHorasHM(t.total) : Core.fmtReais(t.total)]),
      [0, 2, 3]);

    $('sec-arquivo').hidden = r.bloqueado;
    $('txt-previa').value = r.texto;
    $('resultado').hidden = false;
    $('resultado').scrollIntoView({ block: 'start' });
  }

  function baixar() {
    const blob = new Blob([state.res.texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = NOME_ARQUIVO;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- inicialização ----------
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '../ponto-dominio/vendor/pdf.worker.min.js';
  montarRubricas();
  setupDrop('drop-xlsx', 'file-xlsx', f => carregar(f, 'xlsx'));
  setupDrop('drop-pdf', 'file-pdf', f => carregar(f, 'pdf'));
  $('empresa').addEventListener('input', invalidar);
  $('formato-data').addEventListener('change', invalidar);
  $('gerar').addEventListener('click', gerar);
  $('baixar').addEventListener('click', baixar);
})();
