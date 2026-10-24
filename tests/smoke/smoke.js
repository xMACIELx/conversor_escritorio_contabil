'use strict';
// Smoke test de tela (sem modelo de IA): sobe um servidor estático local, abre as telas em Chromium headless,
// falha em console.error / pageerror, carrega uma amostra SINTÉTICA de SPED Fiscal na Conferência de NCM e CST,
// confere o resultado na tela e salva screenshots em tests/smoke/out/.
// Saída: última linha "SMOKE OK" (código 0) ou "SMOKE FALHOU: motivo" (código 1).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { gerarAmostraSped, ESPERADO } = require('./amostra-sped.js');
const { gerarPlanilhaMedias, gerarRelacaoPdf, TXT_ESPERADO, gerarPlanilhaCompetencia, gerarRelacaoPdfFormatoReal, FORMATO_REAL } = require('./medias-amostra.js');
const { gerarPlanilhaDecimoTerceiro, gerarPlanilhaFerias, gerarRelacaoDuasPlanilhas, TXT_DUAS_PLANILHAS, LINHAS_FERIAS } = require('./medias-ferias-amostra.js');
const { gerarPlanilha: gerarPlanilhaPadroes, gerarRelacaoPadroes, LINHAS_SOMA, LINHAS_REPETIDA, TXT_SOMA_EMPRESA_316 } = require('./medias-padroes-amostra.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const SAIDA = path.join(__dirname, 'out');
const TIMEOUT_MS = 15000;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json'
};
// Telas além da Conferência: só precisam abrir sem erro.
const TELAS_SIMPLES = [
  ['inicio', '/'],
  ['dominio-totvs', '/dominio-totvs/'],
  ['ponto-dominio', '/ponto-dominio/']
];

function servidor() {
  return http.createServer((req, res) => {
    let caminho = path.normalize(path.join(RAIZ, decodeURIComponent(req.url.split('?')[0])));
    if (caminho !== RAIZ && !caminho.startsWith(RAIZ + path.sep)) { res.writeHead(403); res.end(); return; }
    if (caminho.split(path.sep).includes('node_modules') || caminho.split(path.sep).includes('.git')) { res.writeHead(404); res.end(); return; }
    if (fs.existsSync(caminho) && fs.statSync(caminho).isDirectory()) caminho = path.join(caminho, 'index.html');
    fs.readFile(caminho, (err, dados) => {
      if (err) { res.writeHead(404); res.end('nao encontrado'); return; }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(caminho)] || 'application/octet-stream' });
      res.end(dados);
    });
  });
}

function falha(motivo) {
  const e = new Error(motivo);
  e.smoke = true;
  return e;
}

// Registra erros de console e de página; checar() lança se houve algum.
function vigiar(page, rotulo) {
  const erros = [];
  page.on('console', m => { if (m.type() === 'error') erros.push('console.error: ' + m.text()); });
  page.on('pageerror', e => erros.push('pageerror: ' + (e && e.message || e)));
  return () => { if (erros.length) throw falha(rotulo + ' com erro (' + erros[0] + ')'); };
}

async function telaConferencia(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(TIMEOUT_MS);
  const checar = vigiar(page, 'Conferência de NCM/CST');
  await page.goto(base + '/conferencia-ncm-cst/', { waitUntil: 'load' });
  await page.waitForSelector('#file', { state: 'attached' });

  await page.setInputFiles('#file', { name: 'amostra-sintetica.txt', mimeType: 'text/plain', buffer: Buffer.from(gerarAmostraSped(), 'latin1') });
  try {
    await page.waitForSelector('#result:not([hidden])');
  } catch (e) {
    throw falha('a tela de resultado não apareceu (status: ' + (await page.textContent('#status')).trim() + ')');
  }

  const texto = id => page.textContent(id).then(t => t.replace(/\s+/g, ' ').trim());
  const banner = await texto('#banner');
  const resumo = await texto('#summary');
  const esperado = [
    [banner, 'Atenção: ' + ESPERADO.inconsistencias + ' inconsistência(s)', 'banner'],
    [resumo, ESPERADO.registros0200 + ' itens no 0200', 'resumo'],
    [resumo, ESPERADO.registrosC170 + ' itens de nota (C170) em ' + ESPERADO.registrosC100 + ' nota(s)', 'resumo'],
    [resumo, ESPERADO.cst051Aceitos + ' itens de CST 051 com base 0 aceitos', 'resumo'],
    [await texto('#resumo-total'), 'Total: ' + ESPERADO.inconsistencias + ' inconsistência(s)', 'resumo das inconsistências'],
    [await texto('#xml-total'), ESPERADO.conferirXmlItens + ' item(ns) em 1 nota(s) de 1 fornecedor(es)', 'bloco a conferir no XML']
  ];
  for (const [real, trecho, onde] of esperado) {
    if (!real.includes(trecho)) throw falha('contador inesperado em ' + onde + ': esperava "' + trecho + '", veio "' + real + '"');
  }
  for (const id of ['#resumo-cst', '#resumo-xml', '#resumo-notas', '#csv-bar']) {
    if (!(await page.isVisible(id))) throw falha('bloco ' + id + ' não está visível');
  }

  await page.screenshot({ path: path.join(SAIDA, 'conferencia-ncm-cst.png'), fullPage: true });
  checar();
  await page.close();
}

// Médias → Domínio: aparece na home, gera o TXT com a amostra sintética, mostra pendências e bloqueia sem código.
async function telaMedias(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(TIMEOUT_MS);
  const checar = vigiar(page, 'Médias → Domínio');
  const texto = id => page.textContent(id).then(t => t.replace(/\s+/g, ' ').trim());

  await page.goto(base + '/', { waitUntil: 'load' });
  if (!(await page.isVisible('a.tool-card[href="medias-dominio/"]'))) throw falha('a aba Médias → Domínio não aparece na home');

  await page.goto(base + '/medias-dominio/', { waitUntil: 'load' });
  await page.waitForSelector('#rub-0');
  await page.fill('#empresa', '7');
  await page.setInputFiles('#file-xlsx', { name: 'apuracao-sintetica.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: gerarPlanilhaMedias() });
  await page.setInputFiles('#file-pdf', { name: 'relacao-sintetica.pdf', mimeType: 'application/pdf', buffer: gerarRelacaoPdf() });
  await page.click('#gerar');
  try {
    await page.waitForSelector('#resultado:not([hidden])');
  } catch (e) {
    throw falha('o relatório não apareceu (aviso: ' + (await texto('#aviso')) + ')');
  }

  const esperado = [
    [await texto('#banner'), 'Arquivo pronto: ' + TXT_ESPERADO.length + ' linha(s) para 2 empregado(s)', 'banner'],
    [await texto('#resumo-cruzados'), 'Empregados cruzados: 2 de 3 nome(s)', 'resumo'],
    [await texto('#t-pendencias'), 'Ana Paula Lima', 'pendências (nome)'],
    [await texto('#t-pendencias'), 'Sem código', 'pendências (situação)'],
    [await texto('#t-totais'), '76:01', 'total da rubrica 150'],
    [await texto('#t-totais'), 'R$ 400,00', 'total da rubrica 236']
  ];
  for (const [real, trecho, onde] of esperado) {
    if (!real.includes(trecho)) throw falha('relatório inesperado em ' + onde + ': esperava "' + trecho + '", veio "' + real + '"');
  }
  const txt = (await page.inputValue('#txt-previa')).replace(/\r\n/g, '\n');
  if (txt !== TXT_ESPERADO.join('\n') + '\n') throw falha('arquivo gerado diferente do esperado: ' + JSON.stringify(txt));

  const [baixado] = await Promise.all([page.waitForEvent('download'), page.click('#baixar')]);
  if (baixado.suggestedFilename() !== 'lancar_medias_7.txt') throw falha('nome sugerido do arquivo: ' + baixado.suggestedFilename());

  await page.screenshot({ path: path.join(SAIDA, 'medias-dominio.png'), fullPage: true });

  // Rubrica em branco com valor nos dados: bloqueia e diz qual coluna.
  await page.fill('#rub-0', '');
  await page.click('#gerar');
  await page.waitForSelector('#banner.bad');
  const bloqueio = await texto('#banner');
  if (!bloqueio.includes('Arquivo não gerado') || !bloqueio.includes('HE 50%')) throw falha('bloqueio por rubrica sem código sem a mensagem esperada: "' + bloqueio + '"');
  if (await page.isVisible('#baixar')) throw falha('o botão de baixar apareceu com o arquivo bloqueado');
  await page.fill('#rub-0', '150');

  // Empresa em branco: bloqueia antes de ler os arquivos.
  await page.fill('#empresa', '');
  await page.click('#gerar');
  const aviso = await texto('#aviso');
  if (!aviso.includes('Informe o código da empresa')) throw falha('empresa vazia sem aviso: "' + aviso + '"');

  checar();
  await page.close();
}

// Médias → Domínio com o formato real (SYN-166): cabeçalho "Código Nome", código e nome no mesmo texto, nome que
// avança sobre o cargo, nome partido, planilha com cabeçalho "Competência", ambíguo e sem par. Passa pelo pdf.js.
async function telaMediasFormatoReal(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(TIMEOUT_MS);
  const checar = vigiar(page, 'Médias → Domínio (formato real)');
  const texto = id => page.textContent(id).then(t => t.replace(/\s+/g, ' ').trim());

  await page.goto(base + '/medias-dominio/', { waitUntil: 'load' });
  await page.waitForSelector('#rub-0');
  await page.fill('#empresa', '7');
  await page.setInputFiles('#file-xlsx', { name: 'apuracao-sintetica.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: gerarPlanilhaCompetencia() });
  await page.setInputFiles('#file-pdf', { name: 'relacao-sintetica-formato-real.pdf', mimeType: 'application/pdf', buffer: gerarRelacaoPdfFormatoReal() });
  await page.click('#gerar');
  try {
    await page.waitForSelector('#resultado:not([hidden])');
  } catch (e) {
    throw falha('o relatório do formato real não apareceu (aviso: ' + (await texto('#aviso')) + ')');
  }

  const esperado = [
    [await texto('#banner'), 'Arquivo pronto: ' + FORMATO_REAL.txtLinhas.length + ' linha(s) para ' + FORMATO_REAL.txtLinhas.length + ' empregado(s)', 'banner'],
    [await texto('#resumo-cruzados'), 'Empregados cruzados: ' + FORMATO_REAL.cruzados + ' de ' + FORMATO_REAL.nomesPlanilha + ' nome(s)', 'resumo'],
    [await texto('#t-pendencias'), 'Ambíguo', 'pendências (situação ambígua)'],
    [await texto('#t-pendencias'), 'Joao Pedro', 'pendências (nome ambíguo)'],
    [await texto('#t-pendencias'), 'Sem código', 'pendências (situação sem par)'],
    [await texto('#t-pendencias'), 'Carla Mendes', 'pendências (nome sem par)']
  ];
  for (const [real, trecho, onde] of esperado) {
    if (!real.includes(trecho)) throw falha('formato real: relatório inesperado em ' + onde + ': esperava "' + trecho + '", veio "' + real + '"');
  }
  if ((await texto('#t-pendencias')).includes('nome e cargo')) throw falha('formato real: linha de nome e cargo ficou pendente');
  const txt = (await page.inputValue('#txt-previa')).replace(/\r\n/g, '\n');
  if (txt !== FORMATO_REAL.txtLinhas.join('\n') + '\n') throw falha('formato real: arquivo gerado diferente do esperado: ' + JSON.stringify(txt));

  checar();
  await page.close();
}

// Médias → Domínio com 13º e férias (SYN-185): dois campos, relatório por planilha, duplicata igual removida e aviso de
// coluna ausente (o 13º de amostra não tem DSR comissões). Depois, férias com valor diferente de Bruno: conflito bloqueia.
async function telaMediasDuasPlanilhas(browser, base) {
  const XLSX_TIPO = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(TIMEOUT_MS);
  const checar = vigiar(page, 'Médias → Domínio (13º e férias)');
  const texto = id => page.textContent(id).then(t => t.replace(/\s+/g, ' ').trim());

  await page.goto(base + '/medias-dominio/', { waitUntil: 'load' });
  await page.waitForSelector('#rub-0');
  await page.fill('#empresa', '7');
  await page.setInputFiles('#file-xlsx', { name: 'decimo-sintetico.xlsx', mimeType: XLSX_TIPO, buffer: gerarPlanilhaDecimoTerceiro() });
  await page.setInputFiles('#file-ferias', { name: 'ferias-sintetica.xlsx', mimeType: XLSX_TIPO, buffer: gerarPlanilhaFerias() });
  await page.setInputFiles('#file-pdf', { name: 'relacao-sintetica-duas-planilhas.pdf', mimeType: 'application/pdf', buffer: gerarRelacaoDuasPlanilhas() });
  await page.click('#gerar');
  try {
    await page.waitForSelector('#resultado:not([hidden])');
  } catch (e) {
    throw falha('o relatório com 13º e férias não apareceu (aviso: ' + (await texto('#aviso')) + ')');
  }

  const esperado = [
    [await texto('#banner'), 'Arquivo pronto: ' + TXT_DUAS_PLANILHAS.length + ' linha(s) para 3 empregado(s)', 'banner'],
    [await texto('#resumo-total'), 'Total geral: 7 linha(s) lida(s) nas planilhas, 4 empregado(s)', 'total geral'],
    [await texto('#resumo-duplicatas'), 'Duplicatas iguais removidas: 5', 'duplicatas'],
    [await texto('#blocos-planilhas'), '13º: decimo-sintetico.xlsx', 'bloco do 13º (arquivo)'],
    [await texto('#blocos-planilhas'), 'Aba lida: "Lançamentos por competência". Linhas lidas: 3', 'bloco do 13º (aba)'],
    [await texto('#blocos-planilhas'), 'férias: ferias-sintetica.xlsx', 'bloco das férias (arquivo)'],
    [await texto('#blocos-planilhas'), 'Aba lida: "Por competência". Linhas lidas: 4', 'bloco das férias (aba)'],
    [await texto('#blocos-planilhas'), 'coluna(s) ausente(s) nesta planilha: DSR comissões', 'aviso de coluna ausente'],
    [await texto('#resumo-cruzados'), 'Empregados cruzados: 4 de 4 nome(s)', 'resumo'],
    [await texto('#t-totais'), '12:30', 'total da rubrica 150'],
    [await texto('#t-totais'), 'R$ 230,00', 'total da rubrica 236'],
    [await texto('#t-totais'), 'R$ 18,00', 'total da rubrica 250']
  ];
  for (const [real, trecho, onde] of esperado) {
    if (!real.includes(trecho)) throw falha('13º e férias: relatório inesperado em ' + onde + ': esperava "' + trecho + '", veio "' + real + '"');
  }
  if (await page.isVisible('#sec-conflitos')) throw falha('13º e férias: seção de conflitos apareceu sem conflito');
  const txt = (await page.inputValue('#txt-previa')).replace(/\r\n/g, '\n');
  if (txt !== TXT_DUAS_PLANILHAS.join('\n') + '\n') throw falha('13º e férias: arquivo gerado diferente do esperado: ' + JSON.stringify(txt));
  await page.screenshot({ path: path.join(SAIDA, 'medias-dominio-duas-planilhas.png'), fullPage: true });

  // Bruno em 09/2026: HE 50% de 2:30 no 13º e de 2:45 nas férias. Conflito bloqueia e lista a diferença.
  const feriasConflito = LINHAS_FERIAS.map(l => (l['Empregado'] === 'Bruno Teste Souza' && l['Competência (MM/AAAA)'] === '09/2026'
    ? Object.assign({}, l, { 'HE 50% (h:mm)': '2:45' }) : l));
  await page.setInputFiles('#file-ferias', { name: 'ferias-sintetica-conflito.xlsx', mimeType: XLSX_TIPO, buffer: gerarPlanilhaFerias(feriasConflito) });
  await page.click('#gerar');
  await page.waitForSelector('#banner.bad');
  const bloqueio = await texto('#banner');
  if (!bloqueio.includes('Arquivo não gerado') || !bloqueio.includes('Conflitos entre planilhas: 1')) throw falha('conflito sem o bloqueio esperado: "' + bloqueio + '"');
  const listaConflito = await texto('#t-conflitos');
  for (const trecho of ['Bruno Teste Souza', '09/2026', 'HE 50%', '13º = 2:30', 'férias = 2:45']) {
    if (!listaConflito.includes(trecho)) throw falha('lista de conflitos sem "' + trecho + '": "' + listaConflito + '"');
  }
  if (!(await page.isVisible('#sec-conflitos'))) throw falha('a seção de conflitos não apareceu');
  if (await page.isVisible('#baixar')) throw falha('o botão de baixar apareceu com conflito');

  checar();
  await page.close();
}

// Médias → Domínio com os padrões da Keli (SYN-197): abre com a empresa 316 e as 11 rubricas de fábrica; DSR HE e
// DSR outros do mesmo empregado saem somados numa linha; o .txt baixado tem CRLF e não tem BOM. Depois, lançamento
// repetido de verdade bloqueia e esconde o download.
async function telaMediasPadroesKeli(browser, base) {
  const XLSX_TIPO = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const RUBRICAS_KELI = ['150', '240', '200', '25', '37', '243', '236', '250', '854', '250', '853'];
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(TIMEOUT_MS);
  const checar = vigiar(page, 'Médias → Domínio (padrões da Keli)');
  const texto = id => page.textContent(id).then(t => t.replace(/\s+/g, ' ').trim());

  await page.goto(base + '/medias-dominio/', { waitUntil: 'load' });
  await page.waitForSelector('#rub-0');
  if ((await page.inputValue('#empresa')) !== '316') throw falha('padrões da Keli: empresa de fábrica diferente de 316');
  const rubricas = await page.$$eval('#rubricas-corpo input', els => els.map(e => e.value));
  if (rubricas.join(',') !== RUBRICAS_KELI.join(',')) throw falha('padrões da Keli: rubricas de fábrica erradas: ' + rubricas.join(','));

  await page.setInputFiles('#file-xlsx', { name: 'apuracao-padroes-sintetica.xlsx', mimeType: XLSX_TIPO, buffer: gerarPlanilhaPadroes(LINHAS_SOMA) });
  await page.setInputFiles('#file-pdf', { name: 'relacao-padroes-sintetica.pdf', mimeType: 'application/pdf', buffer: gerarRelacaoPadroes() });
  await page.click('#gerar');
  try {
    await page.waitForSelector('#resultado:not([hidden])');
  } catch (e) {
    throw falha('padrões da Keli: o relatório não apareceu (aviso: ' + (await texto('#aviso')) + ')');
  }

  const esperado = [
    [await texto('#banner'), 'Arquivo pronto: 2 linha(s) para 2 empregado(s)', 'banner'],
    [await texto('#resumo-somadas'), 'Linhas somadas: 1', 'linhas somadas'],
    [await texto('#t-totais'), 'R$ 25,00', 'total da rubrica 250']
  ];
  for (const [real, trecho, onde] of esperado) {
    if (!real.includes(trecho)) throw falha('padrões da Keli: relatório inesperado em ' + onde + ': esperava "' + trecho + '", veio "' + real + '"');
  }
  const txt = (await page.inputValue('#txt-previa')).replace(/\r\n/g, '\n');
  if (txt !== TXT_SOMA_EMPRESA_316.join('\n') + '\n') throw falha('padrões da Keli: arquivo gerado diferente do esperado: ' + JSON.stringify(txt));

  const [baixado] = await Promise.all([page.waitForEvent('download'), page.click('#baixar')]);
  if (baixado.suggestedFilename() !== 'lancar_medias_316.txt') throw falha('padrões da Keli: nome sugerido do arquivo: ' + baixado.suggestedFilename());
  const bytes = fs.readFileSync(await baixado.path());
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw falha('padrões da Keli: o arquivo baixado tem BOM');
  const conteudo = bytes.toString('utf8');
  if (conteudo !== TXT_SOMA_EMPRESA_316.join('\r\n') + '\r\n') throw falha('padrões da Keli: arquivo baixado diferente do esperado (CRLF): ' + JSON.stringify(conteudo));

  // Lançamento repetido de verdade (a mesma coluna duas vezes) bloqueia: o download some.
  await page.setInputFiles('#file-xlsx', { name: 'apuracao-repetida-sintetica.xlsx', mimeType: XLSX_TIPO, buffer: gerarPlanilhaPadroes(LINHAS_REPETIDA) });
  await page.click('#gerar');
  await page.waitForSelector('#banner.bad');
  if (await page.isVisible('#baixar')) throw falha('padrões da Keli: o botão de baixar apareceu com lançamento repetido');

  checar();
  await page.close();
}

// Home: busca, favoritos que persistem após recarregar, recentes ao voltar, teclado e largura de celular.
async function telaHome(browser, base) {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await contexto.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  const checar = vigiar(page, 'home');
  const texto = sel => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const cartoes = page.locator('#tools-lista a.tool-card');

  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForSelector('#tools-lista .tool-card');
  if ((await cartoes.count()) !== 4) throw falha('home: esperava 4 ferramentas prontas, veio ' + (await cartoes.count()));

  // Busca "ncm": só a Conferência, e os grupos vazios somem.
  await page.fill('#busca', 'ncm');
  await page.waitForFunction(() => document.querySelectorAll('#tools-lista a.tool-card').length === 1);
  if ((await texto('#tools-lista .tool-card-title')) !== 'Conferência de NCM e CST') throw falha('busca por "ncm" não achou a Conferência');
  if ((await page.locator('#tools-lista .secao-titulo').allTextContents()).join('|') !== 'Fiscal') throw falha('busca por "ncm": grupo vazio não sumiu');

  // Sem resultado: mensagem e botão limpar.
  await page.fill('#busca', 'xyzabc');
  await page.waitForSelector('#busca-status:not([hidden])');
  if (!(await texto('#busca-status')).includes('Nenhuma ferramenta encontrada')) throw falha('sem mensagem de nenhum resultado');
  await page.click('#busca-limpar');
  if ((await cartoes.count()) !== 4 || (await page.inputValue('#busca')) !== '') throw falha('limpar busca não restaurou a lista');

  // Estrela fora do link, favorito persiste após recarregar.
  if ((await page.locator('a.tool-card .btn-fav').count()) !== 0) throw falha('estrela dentro do link');
  await page.click('.btn-fav[data-id="conferencia-ncm-cst"]');
  await page.waitForSelector('section[aria-labelledby="secao-favoritos"]');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('section[aria-labelledby="secao-favoritos"]');
  if ((await page.getAttribute('section[aria-labelledby="secao-favoritos"] .btn-fav', 'aria-pressed')) !== 'true') throw falha('favorito não persistiu após recarregar');

  // Recentes: abrir outra ferramenta e voltar.
  await page.click('a.tool-card[href="dominio-totvs/"]');
  await page.waitForURL('**/dominio-totvs/');
  await page.goBack({ waitUntil: 'load' });
  await page.waitForSelector('section[aria-labelledby="secao-recentes"]');
  const recente = page.locator('section[aria-labelledby="secao-recentes"] a.tool-card');
  if ((await recente.count()) !== 1 || (await recente.getAttribute('href')) !== 'dominio-totvs/') throw falha('recentes não mostrou a ferramenta aberta por último');

  // Tecla "/" foca a busca.
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('/');
  if ((await page.evaluate(() => document.activeElement && document.activeElement.id)) !== 'busca') throw falha('a tecla "/" não focou a busca');

  // Celular: sem rolagem horizontal e estrela com alvo de 44 px.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.fill('#busca', '');
  await page.waitForSelector('#tools-lista .tool-card');
  const larguras = await page.evaluate(() => ({ pagina: document.documentElement.scrollWidth, janela: window.innerWidth }));
  if (larguras.pagina > larguras.janela) throw falha('rolagem horizontal no celular (' + larguras.pagina + ' > ' + larguras.janela + ')');
  const alvo = await page.locator('.btn-fav').first().boundingBox();
  if (!alvo || alvo.width < 44 || alvo.height < 44) throw falha('estrela menor que 44 px no celular');

  checar();
  await contexto.close();
}

// Sem localStorage (navegador bloqueou): a home funciona, sem seções de favoritos/recentes e sem erro.
async function telaHomeSemArmazenamento(browser, base) {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await contexto.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('armazenamento bloqueado'); } });
  });
  const page = await contexto.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  const checar = vigiar(page, 'home sem armazenamento');
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForSelector('#tools-lista .tool-card');
  if ((await page.locator('#tools-lista a.tool-card').count()) !== 4) throw falha('home sem armazenamento não listou as 4 ferramentas');
  if ((await page.locator('.btn-fav').count()) !== 0) throw falha('home sem armazenamento mostrou estrela');
  if ((await page.locator('section[aria-labelledby="secao-favoritos"], section[aria-labelledby="secao-recentes"]').count()) !== 0) throw falha('home sem armazenamento mostrou favoritos ou recentes');
  checar();
  await contexto.close();
}

async function telaSimples(browser, base, [nome, caminho]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(TIMEOUT_MS);
  const checar = vigiar(page, 'tela ' + nome);
  const resp = await page.goto(base + caminho, { waitUntil: 'load' });
  if (!resp || !resp.ok()) throw falha('tela ' + nome + ' não abriu (HTTP ' + (resp && resp.status()) + ')');
  await page.waitForSelector('h1');
  await page.screenshot({ path: path.join(SAIDA, nome + '.png'), fullPage: true });
  checar();
  await page.close();
}

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    throw falha('Playwright não instalado (rode npm install)');
  }
  const srv = servidor();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  let browser;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (e) {
      // A causa real (ex.: biblioteca do sistema faltando) vem nas linhas seguintes da mensagem do Playwright.
      throw falha('não abriu o Chromium: ' + String(e.message).replace(/--[a-z-]+(=\S*)?\s*/g, '').replace(/\s*\n\s*/g, ' ').slice(-900) +
        ' (rode npx playwright install chromium; se faltar biblioteca do sistema, um administrador roda npx playwright install-deps chromium)');
    }
    await telaConferencia(browser, base);
    await telaMedias(browser, base);
    await telaMediasFormatoReal(browser, base);
    await telaMediasDuasPlanilhas(browser, base);
    await telaMediasPadroesKeli(browser, base);
    await telaHome(browser, base);
    await telaHomeSemArmazenamento(browser, base);
    for (const t of TELAS_SIMPLES) await telaSimples(browser, base, t);
  } finally {
    if (browser) await browser.close();
    srv.close();
  }
}

main().then(
  () => { console.log('SMOKE OK'); process.exit(0); },
  e => {
    const motivo = e && e.smoke ? e.message : (e && e.stack || String(e)).split('\n').slice(0, 2).join(' ');
    console.log('SMOKE FALHOU: ' + motivo);
    process.exit(1);
  }
);
