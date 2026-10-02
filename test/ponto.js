'use strict';
// Testes da ferramenta Ponto -> Folha Domínio. Chamado por test/test.js: await run(check)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'ponto-dominio');
const CFG = require(path.join(DIR, 'config.js'));
const Core = require(path.join(DIR, 'core.js'));
const Pdf = require(path.join(DIR, 'pdf-parse.js'));

const SAMPLES = path.join(ROOT, 'samples', 'ponto');
const PDF_FILE = path.join(SAMPLES, 'Relatório do ponto- modelo.pdf');
const XLS_FILE = path.join(SAMPLES, '02- Planilha - Sem plano de saúde.xls');

const min = s => Core.minutosDeCentesimos(Pdf.parseCentesimos(s));
const DIV = { FALTAS: CFG.DIVISOR_FALTAS_CENT, DSR: CFG.DIVISOR_DSR_CENT };

module.exports = async function run(check) {
  console.log('\nPonto -> Folha Domínio: conversões');
  check('0,80 h -> 48 min', min('0,80') === 48);
  check('0,18 h -> 11 min', min('0,18') === 11);
  check('0,02 h -> 1 min', min('0,02') === 1);
  check('0,03 h -> 2 min', min('0,03') === 2);
  check('55,73 h -> 3344 min', min('55,73') === 3344);
  check('milhar com ponto: 6.654,13 -> 665413 centésimos', Pdf.parseCentesimos('6.654,13') === 665413);
  check('divisor de faltas = 8,80 h e DSR = 7,33 h (ambos confirmados)', DIV.FALTAS === 880 && DIV.DSR === 733);
  check('8,80 h = 1 dia fechado', (r => r.dias === 1 && r.fecha && !r.zerou)(Core.diasDeCentesimos(880, DIV.FALTAS)));
  check('17,60 h = 2 dias fechados', (r => r.dias === 2 && r.fecha)(Core.diasDeCentesimos(1760, DIV.FALTAS)));
  check('7,33 h de DSR = 1 dia', Core.diasDeCentesimos(733, DIV.DSR).dias === 1);
  check('14,66 h de DSR = 2 dias', (r => r.dias === 2 && r.fecha)(Core.diasDeCentesimos(1466, DIV.DSR)));
  check('4,40 h (meio dia) não fecha e arredonda para 1', (r => r.dias === 1 && !r.fecha)(Core.diasDeCentesimos(440, DIV.FALTAS)));
  check('tolerância de dia inteiro = 0,04 dia', CFG.TOLERANCIA_DIA_CENT === 4);
  check('34,93 h de faltas = 3,969 dias (4 x 8,73 h): 4 dias, sem aviso (desvio 0,031)', (r => r.dias === 4 && r.fecha)(Core.diasDeCentesimos(3493, DIV.FALTAS)));
  check('4,00 h de faltas = 0,455 dia: amarelo (arredonda para 0)', (r => r.dias === 0 && !r.fecha && r.zerou)(Core.diasDeCentesimos(400, DIV.FALTAS)));
  check('3,33 h de DSR = 0,454 dia: amarelo (arredonda para 0)', (r => r.dias === 0 && !r.fecha && r.zerou)(Core.diasDeCentesimos(333, DIV.DSR)));
  check('8,73 h de faltas = 1 dia, sem aviso (0,008 dia)', (r => r.dias === 1 && r.fecha)(Core.diasDeCentesimos(873, DIV.FALTAS)));
  check('17,47 h de faltas = 2 dias, sem aviso (0,015 dia)', (r => r.dias === 2 && r.fecha)(Core.diasDeCentesimos(1747, DIV.FALTAS)));
  check('9,00 h = 1 dia, fecha (0,023 dia de sobra)', (r => r.dias === 1 && r.fecha)(Core.diasDeCentesimos(900, DIV.FALTAS)));
  check('9,10 h = 1 dia, fecha (0,034 dia de sobra, dentro de 0,04)', (r => r.dias === 1 && r.fecha)(Core.diasDeCentesimos(910, DIV.FALTAS)));
  check('9,20 h = 1 dia, não fecha (0,045 dia de sobra)', (r => r.dias === 1 && !r.fecha)(Core.diasDeCentesimos(920, DIV.FALTAS)));
  check('10,00 h = 1 dia, não fecha (0,14 dia de sobra)', (r => r.dias === 1 && !r.fecha)(Core.diasDeCentesimos(1000, DIV.FALTAS)));
  check('DSR 6,67 h = 0,91 dia: entra 1 dia e NÃO fecha (amarelo)', (r => r.dias === 1 && !r.fecha && r.centDias === 91)(Core.diasDeCentesimos(667, DIV.DSR)));
  check('1,50 h arredonda para 0 dia: marcado como zerado', (r => r.dias === 0 && r.zerou && !r.fecha)(Core.diasDeCentesimos(150, DIV.FALTAS)));
  check('0 h não é "zerou"', !Core.diasDeCentesimos(0, DIV.FALTAS).zerou);
  check('dias com divisor alterado na tela (8,00 h)', Core.diasDeCentesimos(1600, 800).dias === 2);

  console.log('\nPonto -> Folha Domínio: mapeamento dos dois layouts e falha silenciosa');
  const mapa = new Map(CFG.EVENTOS.map(e => [e.origem, e]));
  const esperadoMapa = {
    '68001': '0025', '69050': '0150', '69065': '0240', '50101': '0235', '50001': '0260', '50201': '8794',
    '00025': '0025', '00150': '0150', '00200': '0200', '00235': '0235', '00240': '0240', '00260': '0260', '08794': '8794'
  };
  check('mapeamento: 6 códigos de agosto + 7 de setembro, sem repetir origem', CFG.EVENTOS.length === 13 && mapa.size === 13);
  check('mapeamento: cada código vira o evento da Domínio esperado', Object.keys(esperadoMapa).every(k => mapa.get(k) && mapa.get(k).evento === esperadoMapa[k]));
  check('mapeamento: minutos (0025, 0150, 0200, 0235, 0240) e dias (0260 faltas, 8794 DSR)',
    ['00025', '00150', '00200', '00235', '00240'].every(k => mapa.get(k).unidade === 'minutos') &&
    mapa.get('00260').unidade === 'dias' && mapa.get('00260').divisor === 'FALTAS' &&
    mapa.get('08794').unidade === 'dias' && mapa.get('08794').divisor === 'DSR');
  check('mapeamento: os dois grupos têm título para a tela', CFG.EVENTOS.every(e => CFG.GRUPOS_EVENTOS[e.grupo]));
  const rep0 = { colaboradores: [{ nome: 'X', eventos: [{ codigo: '00099', descricao: 'Novo', centesimos: 100 }] }] };
  const p0 = Core.construirPlano(rep0, [{ tipo: 'exato', row: 11 }], DIV);
  check('evento fora da tabela: não gera lançamento e é listado como sem mapeamento', p0.itens.length === 0 && p0.naoMapeados.length === 1);
  const gv = { empresa: '316', competencia: { mm: '09', aaaa: '2026' }, linhas: [{ tipo: 11 }, { tipo: 11 }] };
  const v0 = Core.validar({
    report: { folha: 'Mensal', vencimento: '30/09/2026', colaboradores: [], totais: {} }, grade0: gv, plano: p0,
    decisoes: [{ tipo: 'exato' }], ap: { criadas: [], linhasNovas: [] }, txt: { linhas: [], problemas: [] }
  });
  const nv = n => v0.find(v => v.label === n);
  check('0 linhas no .txt: vermelho "Nenhum lançamento gerado"', nv('Nenhum lançamento gerado') && nv('Nenhum lançamento gerado').nivel === 'erro');
  check('0 linhas no .txt: "Soma por evento" e "Contagem de linhas" NÃO ficam verdes', !nv('Soma por evento') && !nv('Contagem de linhas'));
  check('aviso de eventos sem mapeamento fala com a contadora (sem "config.js")',
    (t => /Avise o desenvolvedor com estes códigos/.test(t) && !/config\.js/.test(t))(nv('Eventos do relatório sem mapeamento').detail));
  const appsrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
  check('botões de download desativados quando o .txt está vazio', /dl-xls'\)\.disabled = vazio/.test(appsrc) && /dl-txt'\)\.disabled = vazio/.test(appsrc));

  console.log('\nPonto -> Folha Domínio: nomes');
  check('normaliza maiúsculas, acentos e espaços', Core.normalizeName('  João  da   Conceição ') === 'JOAO DA CONCEICAO');
  const rows = [{ r: 10, nome: 'CARLOS DIAS' }, { r: 11, nome: 'ADRIANA LOCATELLI' }, { r: 12, nome: 'JOAO SILVA' }, { r: 13, nome: 'JOAO SILVA' }, { r: 14, nome: 'MARIA' }, { r: 15, nome: 'PEDRO ALVES' }, { r: 16, nome: 'PEDRO ALVES SANTOS' }];
  const cols = n => n.map(x => ({ nome: x }));
  const mm = Core.casarColaboradores(cols(['Cárlos  dias', 'adriana locatelli steffenon', 'João Silva', 'Maria Souza', 'Pedro Alves', 'Ana']), rows);
  check('exato ignora acento, caixa e espaços', mm[0].tipo === 'exato' && mm[0].row === 10);
  check('prefixo com 2+ palavras e candidato único = aproximado', mm[1].tipo === 'aprox' && mm[1].row === 11);
  check('nome repetido na planilha = sem correspondência', mm[2].tipo === 'sem');
  check('prefixo de uma palavra só não casa', mm[3].tipo === 'sem');
  check('exato tem prioridade sobre prefixo', mm[4].tipo === 'exato' && mm[4].row === 15);
  check('nome sem parecido = sem correspondência', mm[5].tipo === 'sem');

  console.log('\nPonto -> Folha Domínio: gerador do .txt (regra do .jar)');
  const XLSX = require(path.join(DIR, 'vendor', 'xlsx.full.min.js'));
  // planilha sintética: o .jar lê o texto EXIBIDO da célula (w), então informamos w como o Excel mostraria
  const num = (v, w) => ({ t: 'n', v: v, w: w });
  const sheet = {
    C3: num(316, '0000316'), C6: { t: 'n', v: 46266, z: 'mm/yyyy', w: '09/2026' },
    D10: num(25, '0025'), F10: num(260, '0260'),                       // E10 vazio: coluna sem código
    A11: num(11, '11'), B11: num(941, '941'), D11: num(3344, '3.344,00'), E11: num(9, '9,00'), F11: num(0, '0,00'),
    A12: num(99, '99'), B12: num(5, '5'), D12: num(1, '1,00'), E12: num(1, '1,00'), F12: num(1, '1,00'),
    A13: num(41, '41'), B13: num(5, '5'), F13: num(48, '48,00'),
    A14: num(52, '52'), B14: num(77, '77'), D14: num(0.01, '0,01'),
    A15: { t: 's', v: 'TOTAL', w: 'TOTAL' }, D15: num(999, '999,00'),
    '!ref': 'A1:F15'
  };
  const grade = Core.lerGrade(XLSX, sheet);
  const g = Core.gerarTxt(grade);
  check('só entram valores não zero de linhas 11/41/42/51/52', g.linhas.length === 3, JSON.stringify(g.linhas));
  check('linha de exemplo conferida à mão (43 caracteres)',
    g.linhas[0] === '1000000009412026090025110003344000000000316' && g.linhas[0].length === 43, g.linhas[0]);
  check('48,00 -> 000004800, evento 0260, tipo 41', g.linhas[1] === ['10', '0000000005', '202609', '0260', '41', '000004800', '0000000316'].join(''), g.linhas[1]);
  check('0,01 -> 000000001, tipo 52', g.linhas[2] === ['10', '0000000077', '202609', '0025', '52', '000000001', '0000000316'].join(''), g.linhas[2]);
  check('coluna sem código de evento é ignorada', !g.linhas.some(l => l.substr(18, 4) === '0000'));
  check('quebra CRLF em cada linha', Core.txtComoTexto(g.linhas) === g.linhas.join('\r\n') + '\r\n');
  check('valor com mais de 9 dígitos é sinalizado',
    Core.gerarTxt(Object.assign({}, grade, { linhas: [{ r: 1, tipo: 11, codigoFolha: '1', nome: 'X', valores: ['12.345.678,90', '', ''] }] })).problemas.length === 1);

  console.log('\nPonto -> Folha Domínio: segurança (CSP e vendor)');
  const nginx = fs.readFileSync(path.join(ROOT, 'nginx.conf'), 'utf8');
  check("CSP mantém connect-src 'none' e sem unsafe-eval", /connect-src 'none'/.test(nginx) && !/unsafe-eval/.test(nginx));
  check("CSP não libera CDN (script-src 'self' apenas)", /script-src 'self'(?:["; ])/.test(nginx));
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  check('index.html sem scripts/estilos externos nem inline', !/(?:src|href)=["']https?:/i.test(html) && !/<script(?![^>]*\bsrc=)/i.test(html));
  const appjs = ['app.js', 'core.js', 'pdf-parse.js', 'config.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
  check('código próprio sem eval, new Function, fetch ou XMLHttpRequest', !/\beval\s*\(|new Function|\bfetch\s*\(|XMLHttpRequest/.test(appjs));
  check('pdf.js configurado com isEvalSupported:false', /isEvalSupported:\s*false/.test(fs.readFileSync(path.join(DIR, 'pdf-parse.js'), 'utf8')));
  check('Dockerfile copia ponto-dominio/', /COPY ponto-dominio\/ \/usr\/share\/nginx\/html\/ponto-dominio\//.test(fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')));
  check('vendor/ tem pdf.js, worker e SheetJS', ['pdf.min.js', 'pdf.worker.min.js', 'xlsx.full.min.js'].every(f => fs.existsSync(path.join(DIR, 'vendor', f))));

  console.log('\nPonto -> Folha Domínio: amostras reais (samples/ponto/)');
  if (!fs.existsSync(PDF_FILE) || !fs.existsSync(XLS_FILE)) {
    check('amostras em samples/ponto/ presentes (ficam fora do git)', false, 'copie o PDF e o .xls para samples/ponto/');
    return;
  }
  const pdfjs = require(path.join(DIR, 'vendor', 'pdf.min.js'));
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(DIR, 'vendor', 'pdf.worker.min.js');
  const warn = console.warn; console.warn = () => {};          // pdf.js reclama de fontes padrão no Node
  const lines = await Pdf.extractLines(pdfjs, new Uint8Array(fs.readFileSync(PDF_FILE)));
  console.warn = warn;
  const rep = Pdf.parseReport(lines);
  check('relatório: folha Mensal, vencimento 31/08/2026', rep.folha === 'Mensal' && rep.vencimento === '31/08/2026', rep.folha + ' ' + rep.vencimento);
  check('relatório: 194 colaboradores', rep.colaboradores.length === 194, String(rep.colaboradores.length));
  const cont = {}, soma = {};
  rep.colaboradores.forEach(c => c.eventos.forEach(e => { cont[e.codigo] = (cont[e.codigo] || 0) + 1; soma[e.codigo] = (soma[e.codigo] || 0) + e.centesimos; }));
  // As contagens abaixo foram conferidas contra o "Total dos VDBs" impresso no PDF (soma das horas).
  // Os valores 82/150/33/26/23 do pedido inicial incluíam as linhas de total (no PDF: 331 = soma destas contagens).
  const esperado = { '68001': 81, '69050': 149, '69065': 32, '50101': 25, '50201': 22, '50001': 22 };
  check('relatório: eventos por colaborador (68001=81, 69050=149, 69065=32, 50101=25, 50201=22, 50001=22)',
    Object.keys(esperado).every(k => cont[k] === esperado[k]), JSON.stringify(cont));
  check('relatório: total de lançamentos = "Total: 331" do PDF',
    Object.values(cont).reduce((a, b) => a + b, 0) === rep.totalColaboradores, rep.totalColaboradores + '');
  check('relatório: soma de horas por evento = "Total dos VDBs" do PDF',
    Object.keys(rep.totais).length === 6 && Object.keys(rep.totais).every(k => rep.totais[k] === soma[k]), JSON.stringify([rep.totais, soma]));
  check('relatório: nenhuma linha desconhecida fora do cabeçalho', rep.desconhecidas.length === 0, JSON.stringify(rep.desconhecidas.slice(0, 3)));
  const adel = rep.colaboradores.find(c => c.nome === 'Adelson da Costa');
  check('Adelson da Costa: 68001 = 55,73 h', adel && adel.eventos[0].codigo === '68001' && adel.eventos[0].centesimos === 5573);

  const xbuf = fs.readFileSync(XLS_FILE);
  const abrir = () => XLSX.read(xbuf, { type: 'buffer', cellStyles: true, cellNF: true, cellFormula: true });
  const wb = abrir();
  const grade0 = Core.lerGrade(XLSX, wb.Sheets[wb.SheetNames[0]]);
  check('planilha: 233 colaboradores, empresa 316, competência 09/2026',
    grade0.linhas.length === 233 && grade0.empresa === '0000316' && grade0.competencia.mm === '09' && grade0.competencia.aaaa === '2026');
  check('planilha: eventos 150, 25, 260, 235 e 8794 presentes; 240 ausente', (() => {
    const cs = grade0.colunas.map(c => c.codigo);
    return ['150', '025', '260', '235', '8794'].every(x => cs.some(c => c.padStart(4, '0') === x.padStart(4, '0'))) && !cs.some(c => c === '240');
  })());

  const m = Core.casarColaboradores(rep.colaboradores, grade0.linhas);
  const n = { exato: 0, aprox: 0, sem: 0 }; m.forEach(x => n[x.tipo]++);
  check('casamento: 180 exatos, 2 aproximados, 12 sem correspondência', n.exato === 180 && n.aprox === 2 && n.sem === 12, JSON.stringify(n));
  const aprox = rep.colaboradores.map((c, i) => m[i].tipo === 'aprox' ? c.nome + '>' + m[i].nomePlanilha : null).filter(Boolean);
  check('aproximados: Adriana Locatelli Steffenon e Valdilene ...', aprox.length === 2 && /Adriana Locatelli Steffenon>ADRIANA LOCATELLI/.test(aprox[0]), aprox.join(' | '));

  const decBase = () => m.map(x => ({ tipo: x.tipo, row: x.row, confirmado: false, codigoManual: '' }));
  function rodar(dec) {
    const w = abrir();
    const plano = Core.construirPlano(rep, dec, DIV);
    const ap = Core.aplicarNaPlanilha(XLSX, w, rep, dec, plano, 11);
    const txt = Core.gerarTxt(ap.grade);
    const val = Core.validar({ report: rep, grade0, plano, decisoes: dec, ap, txt });
    return { w, plano, ap, txt, val };
  }

  const dec0 = decBase();
  const r0 = rodar(dec0);
  const incl = new Set(rep.colaboradores.map((c, i) => Core.incluido(dec0[i]) ? i : -1).filter(i => i >= 0));
  check('padrão: aproximados desmarcados ficam de fora (180 incluídos)', incl.size === 180);
  check('todas as linhas do .txt têm 43 caracteres', r0.txt.linhas.every(l => l.length === 43));
  check('coluna do 0240 criada na primeira posição livre (J)', r0.ap.criadas.length === 1 && r0.ap.criadas[0].evento === '0240' && r0.ap.criadas[0].coluna === 'J', JSON.stringify(r0.ap.criadas));
  const l1 = r0.txt.linhas.find(l => l.substr(2, 10) === '0000000941' && l.substr(18, 4) === '0025');
  check('Adelson da Costa 55,73 h -> 3344 min -> "000334400" no .txt', l1 === '1000000009412026090025110003344000000000316', l1);
  check('competência da planilha preservada (202609, não a do relatório)', r0.txt.linhas.every(l => l.substr(12, 6) === '202609'));
  check('soma por evento do .txt = soma convertida do relatório (só incluídos)', (() => {
    const esp = {};
    rep.colaboradores.forEach((c, i) => { if (!incl.has(i)) return; Core.agregarEventos(c).forEach(a => {
      const mp = CFG.EVENTOS.find(e => e.origem === a.codigo);
      const v = mp.unidade === 'minutos' ? Core.minutosDeCentesimos(a.centesimos) : Core.diasDeCentesimos(a.centesimos, DIV[mp.divisor]).dias;
      esp[mp.evento] = (esp[mp.evento] || 0) + v * 100;
    }); });
    const got = {}; r0.txt.linhas.forEach(l => { got[l.substr(18, 4)] = (got[l.substr(18, 4)] || 0) + parseInt(l.substr(24, 9), 10); });
    return JSON.stringify(Object.keys(esp).sort().map(k => [k, esp[k]])) === JSON.stringify(Object.keys(got).sort().map(k => [k, got[k]]));
  })());
  const nivel = nome => (r0.val.find(v => v.label === nome) || {}).nivel;
  check('validação: competência diferente vira AVISO (08/2026 x 09/2026), sem bloquear', nivel('Competência diferente') === 'aviso');
  check('validação: leitura do PDF confere com os totais do relatório', nivel('Leitura do relatório') === 'ok');
  check('validação: tipo de cálculo Mensal = 11 confere', nivel('Tipo de cálculo') === 'ok');
  check('validação: soma por evento e contagem de linhas ok', nivel('Soma por evento') === 'ok' && nivel('Contagem de linhas') === 'ok');
  check('validação: sem nenhum erro nas amostras', !r0.val.some(v => v.nivel === 'erro'), JSON.stringify(r0.val.filter(v => v.nivel === 'erro')));
  check('dias que não fecham são sinalizados e entram arredondados', r0.plano.naoFecham.length > 0 && r0.plano.naoFecham.every(x => !x.fecha && x.valor >= 0));
  const raf = r0.plano.conferencia.find(l => l.nome === 'Rafaela Amanda Stevens Dutra' && l.origem === '50201');
  check('Rafaela Amanda Stevens Dutra (50201: 6,67 h = 0,91 dia) aparece em amarelo, entra 1 dia',
    raf && raf.horas === 667 && raf.status === 'naofecha' && raf.valor === 1 && r0.plano.naoFecham.includes(raf), JSON.stringify(raf));
  const semAviso = r0.plano.conferencia.filter(l => l.origem === '50001' && (l.horas === 873 || l.horas === 1747));
  check('faltas de 8,73 h e 17,47 h seguem sem aviso (' + semAviso.length + ' na amostra)', semAviso.length > 0 && semAviso.every(l => l.fecha && l.status !== 'naofecha'), JSON.stringify(semAviso.map(l => l.nome + l.status)));

  // quem tem código digitado entra; aproximado confirmado entra
  const dec1 = decBase();
  const iSem = m.findIndex(x => x.tipo === 'sem'), iAp = m.findIndex(x => x.tipo === 'aprox');
  dec1[iSem].codigoManual = '7777'; dec1[iAp].confirmado = true;
  const r1 = rodar(dec1);
  check('código digitado e aproximado confirmado entram no arquivo',
    r1.txt.linhas.some(l => l.substr(2, 10) === '0000007777') && r1.txt.linhas.length > r0.txt.linhas.length && r1.ap.linhasNovas.length === 1);
  check('linha nova entra antes dos totais e o total do 0240 é recalculado', (() => {
    const ws = r1.w.Sheets[r1.w.SheetNames[0]];
    const ult = XLSX.utils.decode_range(ws['!ref']).e.r + 1;
    return ws['J' + ult] && /SUM\(J181:J244\)/.test(ws['J' + ult].f) && ws['J' + ult].v > 0;
  })());

  // round-trip: gravar o .xls, ler de volta e aplicar a regra do .jar
  for (const [nome, r] of [['padrão', r0], ['com código digitado e aproximado confirmado', r1]]) {
    const out = XLSX.write(r.w, { bookType: 'biff8', type: 'buffer' });
    check('round-trip (' + nome + '): .xls gerado é BIFF (formato 97-2003)', out[0] === 0xD0 && out[1] === 0xCF);
    const w2 = XLSX.read(out, { type: 'buffer', cellNF: true, cellFormula: true });
    const volta = Core.gerarTxt(Core.lerGrade(XLSX, w2.Sheets[w2.SheetNames[0]]));
    check('round-trip (' + nome + '): .xls relido + regra do .jar = MESMO .txt (' + volta.linhas.length + ' linhas)',
      Core.txtComoTexto(volta.linhas) === Core.txtComoTexto(r.txt.linhas));
    const ws2 = w2.Sheets[w2.SheetNames[0]];
    const cel = ws2['F11'];
    check('round-trip (' + nome + '): formato da célula e competência preservados', cel && cel.z === '#,##0.00' && ws2.C6.w === '09/2026', JSON.stringify([cel, ws2.C6]));
  }
};
