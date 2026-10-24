(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const CFG = window.MediasConfig, Core = window.MediasCore;

  // dec (13º) e ferias: { buf, nome } ou null. pdfBuf: a Relação de Empregados.
  const state = { dec: null, ferias: null, pdfBuf: null, res: null };
  // Áreas de envio por tipo: cada uma tem o quadro (drop) e os textos de nome (main) e tamanho (sub)
  const AREAS = {
    dec: { drop: 'drop-xlsx', main: 'xlsx-main', sub: 'xlsx-sub' },
    ferias: { drop: 'drop-ferias', main: 'ferias-main', sub: 'ferias-sub' },
    pdf: { drop: 'drop-pdf', main: 'pdf-main', sub: 'pdf-sub' }
  };
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
      input.value = c.rubrica || '';
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
  // tipo: 'dec' (13º), 'ferias' (férias) ou 'pdf' (Relação de Empregados).
  function carregar(file, tipo) {
    const ok = tipo === 'pdf' ? /\.pdf$/i.test(file.name) : /\.xlsx?$/i.test(file.name);
    if (!ok) {
      mostrarAviso(tipo === 'pdf' ? 'Envie a Relação de Empregados em PDF.' : 'Envie a planilha em .xlsx (ou .xls).');
      return;
    }
    file.arrayBuffer().then(buf => {
      const area = AREAS[tipo];
      if (tipo === 'pdf') state.pdfBuf = buf; else state[tipo] = { buf: buf, nome: file.name };
      $(area.drop).classList.add('loaded');
      $(area.main).textContent = file.name;
      $(area.sub).textContent = tamanho(file.size);
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
    if (!state.dec && !state.ferias) lista.push('Envie a planilha do 13º ou a de férias (.xlsx).');
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
    $('status').textContent = on ? 'Lendo as planilhas e a Relação de Empregados...' : '';
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
      // 13º e férias, nesta ordem; cada uma é lida pela aba que tiver o cabeçalho esperado
      const planilhas = [];
      if (state.dec) planilhas.push({ rotulo: '13º', arquivo: state.dec.nome, wb: window.XLSX.read(state.dec.buf, { type: 'array' }) });
      if (state.ferias) planilhas.push({ rotulo: 'férias', arquivo: state.ferias.nome, wb: window.XLSX.read(state.ferias.buf, { type: 'array' }) });
      const uniao = Core.unirPlanilhas(window.XLSX, planilhas);
      const rel = await Core.lerRelacaoPdf(window.pdfjsLib, new Uint8Array(state.pdfBuf.slice(0)), uniao.linhas.map(l => l.nome));
      const casamento = Core.casarEmpregados(uniao.linhas, rel.empregados);
      const pendencias = uniao.pendencias.concat(rel.pendencias.map(p => Object.assign({ bloqueia: false }, p)));
      const res = Core.gerarTxt({ empresa: $('empresa').value, lancamentos: uniao.linhas, pendencias, casamento });
      state.res = Object.assign(res, {
        empresa: $('empresa').value.trim(),
        casamento,
        semCodigo: colunasSemCodigo(uniao.linhas),
        planilhas: uniao.relatorio.map((r, i) => Object.assign({ arquivo: planilhas[i].arquivo }, r)),
        duplicatasRemovidas: uniao.duplicatasRemovidas,
        totalEmpregados: new Set(uniao.linhas.map(l => Core.normalizarNome(l.nome))).size
      });
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
    nome_repetido: 'Nome repetido na competência', conflito_entre_planilhas: 'Conflito entre planilhas',
    lancamento_repetido: 'Lançamento repetido', cabecalho_ausente: 'Cabeçalho não achado', coluna_ausente: 'Coluna ausente',
    empresa_ausente: 'Empresa vazia', nome_e_cargo_no_mesmo_trecho: 'PDF: nome e cargo juntos', codigo_sem_nome: 'PDF: código sem nome',
    nome_parcial_ambiguo: 'PDF: nome parcial ambíguo'
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
    const conflitos = pend.filter(p => p.tipo === 'conflito_entre_planilhas');
    const bloqueios = pend.filter(p => p.bloqueia).length;
    // coluna ausente é aviso (não tira empregado nem linha do arquivo); o resto que não bloqueia fica de fora
    const avisos = pend.filter(p => p.tipo === 'coluna_ausente').length;
    const foraDoArquivo = pend.filter(p => !p.bloqueia && p.tipo !== 'coluna_ausente').length;
    const linhasLidas = r.planilhas.reduce((n, p) => n + p.linhasLidas, 0);

    const banner = $('banner');
    if (r.bloqueado) {
      const sem = r.semCodigo.length ? ' Rubrica sem código usada nos dados: ' + r.semCodigo.join(', ') + '.' : '';
      const con = conflitos.length ? ' Conflitos entre planilhas: ' + conflitos.length + '.' : '';
      banner.className = 'banner bad';
      banner.textContent = 'Arquivo não gerado: ' + bloqueios + ' pendência(s) bloqueiam a geração.' + sem + con;
    } else if (foraDoArquivo) {
      banner.className = 'banner warn';
      banner.textContent = 'Arquivo pronto: ' + r.totais.linhas + ' linha(s) para ' + r.totais.empregados + ' empregado(s). ' + foraDoArquivo + ' pendência(s) ficaram de fora; confira abaixo.';
    } else if (avisos) {
      banner.className = 'banner warn';
      banner.textContent = 'Arquivo pronto: ' + r.totais.linhas + ' linha(s) para ' + r.totais.empregados + ' empregado(s). ' + avisos + ' aviso(s) de coluna ausente; confira abaixo.';
    } else {
      banner.className = 'banner good';
      banner.textContent = 'Arquivo pronto: ' + r.totais.linhas + ' linha(s) para ' + r.totais.empregados + ' empregado(s), sem pendências.';
    }

    const semCodigo = pend.filter(p => p.tipo === 'sem_par').length;
    const ambiguos = pend.filter(p => p.tipo === 'ambiguo').length;
    $('resumo-cruzados').textContent = 'Empregados cruzados: ' + cruzados.length + ' de ' + r.casamento.size + ' nome(s) da planilha.';
    $('resumo-pendencias').textContent = 'Pendências: ' + semCodigo + ' sem código, ' + ambiguos + ' ambíguo(s), ' + (pend.length - semCodigo - ambiguos) + ' outra(s).';
    $('resumo-linhas').textContent = 'Linhas geradas: ' + r.totais.linhas + '.';
    $('resumo-total').textContent = 'Total geral: ' + linhasLidas + ' linha(s) lida(s) nas planilhas, ' + r.totalEmpregados + ' empregado(s).';
    $('resumo-duplicatas').textContent = 'Duplicatas iguais removidas: ' + r.duplicatasRemovidas + '.';
    $('resumo-somadas').textContent = 'Linhas somadas: ' + r.totais.linhasSomadas + ' (mesma rubrica repetida no mesmo empregado e competência, numa linha só).';
    $('n-cruzados').textContent = '(' + cruzados.length + ')';
    $('n-pendencias').textContent = '(' + pend.length + ')';

    // um bloco por planilha: arquivo, aba usada, linhas, empregados e as colunas que faltaram (aviso amarelo)
    const blocos = $('blocos-planilhas');
    clear(blocos);
    r.planilhas.forEach(p => {
      const bloco = el('div', 'bloco-planilha');
      bloco.append(el('h3', null, p.rotulo + ': ' + p.arquivo));
      bloco.append(el('p', 'hint', 'Aba lida: "' + p.aba + '". Linhas lidas: ' + p.linhasLidas + '. Empregados: ' + p.empregados + '.'));
      if (p.colunasAusentes.length) {
        bloco.append(el('p', 'banner warn', 'Aviso (não bloqueia): coluna(s) ausente(s) nesta planilha: ' + p.colunasAusentes.join(', ') + '. Essas rubricas ficam sem valor desta planilha; confira se era para ter.'));
      }
      blocos.append(bloco);
    });

    $('sec-conflitos').hidden = !conflitos.length;
    tabela('t-conflitos', ['Empregado', 'Diferença entre as planilhas'],
      conflitos.map(c => [c.nome || '', c.detalhe || '']));

    tabela('t-cruzados', ['Nome na planilha', 'Código na Domínio', 'Conferência'],
      cruzados.map(c => [c.nome, c.codigo, c.parcial ? 'nome parcial, conferir' : '']));
    tabela('t-pendencias', ['Situação', 'Nome', 'Linha', 'Detalhe'],
      pend.length ? pend.map(p => [(p.bloqueia ? 'Bloqueia: ' : '') + (ROTULOS[p.tipo] || p.tipo), p.nome || '', p.linha || '',
        (p.planilha ? '[' + p.planilha + '] ' : '') + (p.detalhe || '')]) : [['Nenhuma pendência.', '', '', '']]);
    tabela('t-totais', ['Rubrica', 'Lançamento', 'Linhas', 'Total'],
      r.totais.porRubrica.map(t => [t.rubrica, t.descricao, String(t.linhas), t.unidade === 'horas' ? Core.fmtHorasHM(t.total) : Core.fmtReais(t.total)]),
      [0, 2, 3]);

    $('sec-arquivo').hidden = r.bloqueado;
    $('baixar').disabled = r.bloqueado;
    $('txt-previa').value = r.texto;
    $('resultado').hidden = false;
    $('resultado').scrollIntoView({ block: 'start' });
  }

  // O texto já sai com CRLF do core (CFG.FIM_DE_LINHA); o Blob de string não acrescenta BOM.
  function baixar() {
    if (!state.res || state.res.bloqueado) return;
    const blob = new Blob([state.res.texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = 'lancar_medias_' + state.res.empresa + '.txt';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- inicialização ----------
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '../ponto-dominio/vendor/pdf.worker.min.js';
  $('empresa').value = CFG.EMPRESA_PADRAO;
  montarRubricas();
  setupDrop('drop-xlsx', 'file-xlsx', f => carregar(f, 'dec'));
  setupDrop('drop-ferias', 'file-ferias', f => carregar(f, 'ferias'));
  setupDrop('drop-pdf', 'file-pdf', f => carregar(f, 'pdf'));
  $('empresa').addEventListener('input', invalidar);
  $('formato-data').addEventListener('change', invalidar);
  $('gerar').addEventListener('click', gerar);
  $('baixar').addEventListener('click', baixar);
})();
