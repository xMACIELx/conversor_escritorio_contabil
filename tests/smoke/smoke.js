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
  if (baixado.suggestedFilename() !== 'lancar_medias.txt') throw falha('nome sugerido do arquivo: ' + baixado.suggestedFilename());

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
