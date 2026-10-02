'use strict';
// Relatório de SETEMBRO: códigos de evento da própria Domínio (5 dígitos). Chamado por test/test.js.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'ponto-dominio');
const CFG = require(path.join(DIR, 'config.js'));
const Core = require(path.join(DIR, 'core.js'));
const Pdf = require(path.join(DIR, 'pdf-parse.js'));

const SAMPLES = path.join(ROOT, 'samples', 'ponto');
const PDF_FILE = path.join(SAMPLES, 'setembro - relatorio.pdf');
const XLS_FILE = path.join(SAMPLES, 'setembro - planilha.xls');
const DIV = { FALTAS: CFG.DIVISOR_FALTAS_CENT, DSR: CFG.DIVISOR_DSR_CENT };

module.exports = async function run(check) {
  console.log('\nPonto -> Folha Domínio: relatório de setembro (códigos da Domínio)');
  if (!fs.existsSync(PDF_FILE) || !fs.existsSync(XLS_FILE)) {
    check('amostras de setembro em samples/ponto/ presentes (ficam fora do git)', false,
      'copie "setembro - relatorio.pdf" e "setembro - planilha.xls" para samples/ponto/');
    return;
  }
  const pdfjs = require(path.join(DIR, 'vendor', 'pdf.min.js'));
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(DIR, 'vendor', 'pdf.worker.min.js');
  const XLSX = require(path.join(DIR, 'vendor', 'xlsx.full.min.js'));

  const warn = console.warn; console.warn = () => {};
  const lines = await Pdf.extractLines(pdfjs, new Uint8Array(fs.readFileSync(PDF_FILE)));
  console.warn = warn;
  const rep = Pdf.parseReport(lines);

  check('relatório: folha Mensal, vencimento 30/09/2026, 194 colaboradores',
    rep.folha === 'Mensal' && rep.vencimento === '30/09/2026' && rep.colaboradores.length === 194, rep.folha + ' ' + rep.vencimento + ' ' + rep.colaboradores.length);
  const cont = {}, soma = {};
  rep.colaboradores.forEach(c => c.eventos.forEach(e => { cont[e.codigo] = (cont[e.codigo] || 0) + 1; soma[e.codigo] = (soma[e.codigo] || 0) + e.centesimos; }));
  const esperado = { '00025': 83, '00150': 146, '00200': 4, '00235': 21, '00240': 42, '00260': 7, '08794': 6 };
  check('relatório: eventos 00025=83, 00150=146, 00200=4, 00235=21, 00240=42, 00260=7, 08794=6',
    Object.keys(esperado).every(k => cont[k] === esperado[k]) && Object.keys(cont).length === 7, JSON.stringify(cont));
  const totalEv = Object.values(cont).reduce((a, b) => a + b, 0);
  check('relatório: total 309 = "Total: 309" do PDF', totalEv === 309 && rep.totalColaboradores === 309, totalEv + ' / ' + rep.totalColaboradores);
  check('relatório: soma de horas por evento = "Total dos VDBs" do PDF',
    Object.keys(rep.totais).length === 7 && Object.keys(rep.totais).every(k => rep.totais[k] === soma[k]), JSON.stringify([rep.totais, soma]));
  check('relatório: nenhuma linha desconhecida fora do cabeçalho', rep.desconhecidas.length === 0, JSON.stringify(rep.desconhecidas.slice(0, 3)));
  check('todos os 7 códigos do relatório estão no mapeamento', Object.keys(cont).every(k => CFG.EVENTOS.some(e => e.origem === k)));

  const xbuf = fs.readFileSync(XLS_FILE);
  const abrir = () => XLSX.read(xbuf, { type: 'buffer', cellStyles: true, cellNF: true, cellFormula: true });
  const grade0 = Core.lerGrade(XLSX, abrir().Sheets.PLANILHA);
  check('planilha de setembro: competência 09/2026 e colunas 0200 e 0240 já existem',
    grade0.competencia.mm === '09' && grade0.competencia.aaaa === '2026' && grade0.colunas.some(c => c.codigo === '0200') && grade0.colunas.some(c => c.codigo === '0240'));

  const m = Core.casarColaboradores(rep.colaboradores, grade0.linhas);
  const n = { exato: 0, aprox: 0, sem: 0 }; m.forEach(x => n[x.tipo]++);
  check('casamento: 193 exatos, 0 aproximados, 1 sem correspondência', n.exato === 193 && n.aprox === 0 && n.sem === 1, JSON.stringify(n));
  const sem = rep.colaboradores.filter((c, i) => m[i].tipo === 'sem').map(c => c.nome);
  check('sem correspondência: Ana Claudia Rohrig', sem.length === 1 && sem[0] === 'Ana Claudia Rohrig', sem.join(', '));

  const dec = m.map(x => ({ tipo: x.tipo, row: x.row, confirmado: false, codigoManual: '' }));
  const plano = Core.construirPlano(rep, dec, DIV);
  const wb = abrir();
  const ap = Core.aplicarNaPlanilha(XLSX, wb, rep, dec, plano, 11);
  const txt = Core.gerarTxt(ap.grade);
  const val = Core.validar({ report: rep, grade0, plano, decisoes: dec, ap, txt });

  check('193 colaboradores incluídos', dec.filter(Core.incluido).length === 193);
  check('nenhum evento sem mapeamento e nenhuma coluna criada na planilha', plano.naoMapeados.length === 0 && ap.criadas.length === 0);
  check('302 linhas no .txt, todas com 43 caracteres', txt.linhas.length === 302 && txt.linhas.every(l => l.length === 43), String(txt.linhas.length));
  check('Adelson da Costa: 00025 70,23 h -> 4214 min -> 70,14 -> linha 1000000009412026090025110000070140000000316',
    txt.linhas.includes('1000000009412026090025110000070140000000316'));
  const jalmir = id => txt.linhas.find(l => l.substr(2, 10) === '0000000003' && l.substr(18, 4) === id);
  check('Jalmir Mollmann (código folha 3): 0150 0,27 h -> 16 min -> 0,16 -> linha 1000000000032026090150110000000160000000316',
    jalmir('0150') === '1000000000032026090150110000000160000000316', jalmir('0150'));
  check('Jalmir Mollmann (código folha 3): 0235 2,40 h -> 144 min -> 2,24 -> linha 1000000000032026090235110000002240000000316',
    jalmir('0235') === '1000000000032026090235110000002240000000316', jalmir('0235'));
  const adel = plano.itens.find(i => i.nome === 'Adelson da Costa' && i.origem === '00025');
  check('Adelson da Costa: 7.023 centésimos -> 4214 minutos -> célula 70,14', adel && adel.horas === 7023 && adel.minutos === 4214 && adel.cent === 7014, JSON.stringify(adel));
  check('competência do arquivo = 202609', txt.linhas.every(l => l.substr(12, 6) === '202609'));

  const zer = plano.zerados.map(z => z.nome + '|' + z.origem + '|' + Core.fmtCent(z.horas)).sort();
  const zerEsp = [
    'Larissa Ines Wiland|00260|4,00',
    'Rafaela Amanda Stevens Dutra|00260|4,00', 'Rafaela Amanda Stevens Dutra|08794|3,33',
    'Yasmin Julia Goncalves dos Santos|00260|4,00', 'Yasmin Julia Goncalves dos Santos|08794|3,33'
  ].sort();
  check('viram zero e ficam fora (avisados): Larissa, Rafaela (2) e Yasmin (2)', JSON.stringify(zer) === JSON.stringify(zerEsp), JSON.stringify(zer));
  check('esses 5 não entram no .txt e o aviso "Valor que viraria zero" existe',
    plano.zerados.every(z => !plano.itens.includes(z)) && val.some(v => v.label === 'Valor que viraria zero' && v.nivel === 'aviso'));
  check('os 5 casos reais estão em amarelo (não fecham dia inteiro)', plano.zerados.every(z => !z.fecha && z.status === 'zerou'));

  ['Elizabete Vargas de Melo', 'Maria Raquel Rosa Maciel'].forEach(nome => {
    const l = plano.conferencia.find(x => x.nome === nome && x.origem === '00260');
    check(nome + ': 00260 34,93 h = 4 dias, sem aviso', l && l.horas === 3493 && l.dias === 4 && l.cent === 400 && l.fecha && l.status === 'ok', JSON.stringify(l));
  });
  check('nada mais fica em amarelo além dos 5 zerados (tolerância 0,04)', plano.naoFecham.every(x => plano.zerados.includes(x)), JSON.stringify(plano.naoFecham.map(x => [x.nome, x.origem, x.horas])));

  const nivel = nome => (val.find(v => v.label === nome) || {}).nivel;
  check('validação: competência igual (09/2026), leitura do PDF, tipo, soma e contagem = ok',
    nivel('Competência') === 'ok' && nivel('Leitura do relatório') === 'ok' && nivel('Tipo de cálculo') === 'ok' && nivel('Soma por evento') === 'ok' && nivel('Contagem de linhas') === 'ok');
  check('validação: sem erros', !val.some(v => v.nivel === 'erro'), JSON.stringify(val.filter(v => v.nivel === 'erro')));

  const out = XLSX.write(wb, { bookType: 'biff8', type: 'buffer' });
  const w2 = XLSX.read(out, { type: 'buffer', cellNF: true, cellFormula: true });
  const volta = Core.gerarTxt(Core.lerGrade(XLSX, w2.Sheets[w2.SheetNames[0]]));
  check('round-trip: .xls relido + regra do .jar = MESMO .txt (' + volta.linhas.length + ' linhas)', Core.txtComoTexto(volta.linhas) === Core.txtComoTexto(txt.linhas));
};
