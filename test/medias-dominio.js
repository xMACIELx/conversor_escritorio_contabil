'use strict';
// Testes da ferramenta Médias → Domínio. Chamado por test/regras.js: await run(check)
// Só dados sintéticos, criados aqui no código. Nenhum dado real de empregado.
const path = require('path');

const DIR = path.join(__dirname, '..', 'medias-dominio');
const Core = require(path.join(DIR, 'core.js'));
const CFG_DATA = require(path.join(DIR, 'config.js')).FORMATO_DATA;
const XLSX = require(path.join(DIR, '..', 'ponto-dominio', 'vendor', 'xlsx.full.min.js'));
// Amostras sintéticas do formato real (SYN-166), as mesmas que o smoke usa
const GEN = require(path.join(__dirname, '..', 'tests', 'smoke', 'medias-amostra.js'));

// Relação de Empregados sintética (código e nome, como o PDF da Domínio entregaria)
const LISTA = [
  { codigo: '101', nome: 'MARIA DA SILVA' },
  { codigo: '102', nome: 'José Santos' },
  { codigo: '103', nome: 'CARLOS SOUZA' },
  { codigo: '104', nome: 'Carlos  Souza' }
];

const CABECALHO = ['Matrícula', 'Empregado', 'Competência MM/AAAA', 'HE 50% (h:mm)', 'HE 65% (h:mm)', 'HE 100% (h:mm)',
  'Adic. noturno (h:mm)', 'Comissões (R$)', 'Prêmio (R$)', 'Assiduidade (R$)', 'DSR HE (R$)', 'DSR noturno (R$)', 'DSR outros (R$)'];

// Uma linha da planilha: valores por nome de cabeçalho (o resto fica vazio)
function lin(matricula, nome, competencia, valores) {
  return CABECALHO.map(c => {
    if (c === 'Matrícula') return matricula;
    if (c === 'Empregado') return nome;
    if (c === 'Competência MM/AAAA') return competencia;
    return (valores && c in valores) ? valores[c] : null;
  });
}

function planilha(linhas, cabecalho) {
  return [['AMOSTRA SINTÉTICA: não é dado real'], [], cabecalho || CABECALHO].concat(linhas);
}

function pasta(aoa) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Lançamentos por competência');
  return wb;
}

// Pipeline completo: planilha -> casamento -> TXT
function gerar(linhas, opts) {
  const o = opts || {};
  const lido = Core.lerLancamentos(XLSX, pasta(planilha(linhas, o.cabecalho)));
  const casamento = Core.casarEmpregados(lido.linhas, o.lista || LISTA);
  return Core.gerarTxt({ empresa: 'empresa' in o ? o.empresa : '7', lancamentos: lido.linhas, pendencias: lido.pendencias, casamento });
}

// Amostra base: uma pessoa com exato, uma com exato (acento), uma sem par, uma ambígua
const BASE = [
  lin('001', 'Maria da Silva', '09/2026', { 'HE 50% (h:mm)': '74:31', 'Comissões (R$)': 0, 'Assiduidade (R$)': 'R$ 400,00', 'DSR HE (R$)': 'R$ 12,50' }),
  lin('002', 'José Santos', '09/2026', { 'HE 50% (h:mm)': '1:30', 'Prêmio (R$)': 0 }),
  lin('003', 'Ana Paula Lima', '09/2026', { 'HE 50% (h:mm)': '2:00' }),
  lin('004', 'Carlos Souza', '09/2026', { 'DSR HE (R$)': 'R$ 5,00' })
];
const TXT_ESPERADO = ['7;101;01/09/2026;150;7431', '7;101;01/09/2026;236;40000', '7;101;01/09/2026;250;1250', '7;102;01/09/2026;150;130'];

module.exports = async function run(check) {
  console.log('\nMédias → Domínio: conversão de horas (H,MM)');
  check('74:31 vira 7431 (horas e minutos viram H,MM)', Core.horasHM('74:31') === 7431, String(Core.horasHM('74:31')));
  check('1:30 vira 130', Core.horasHM('1:30') === 130);
  check('mais de 24 h: 27:05 vira 2705', Core.horasHM('27:05') === 2705);
  check('duração do Excel (fração do dia): 74:31 vira 7431', Core.horasHM(4471 / 1440) === 7431, String(Core.horasHM(4471 / 1440)));
  check('minutos acima de 59 são recusados (74:60 vira nulo)', Core.horasHM('74:60') === null);
  check('soma em minutos: 74:31 + 1:30 = 76:01', Core.fmtHorasHM(Core.minutosDeHM(7431) + Core.minutosDeHM(130)) === '76:01');

  console.log('\nMédias → Domínio: conversão de valores (R$ em centavos)');
  check('R$ 400,00 vira 40000', Core.centavosDeReais('R$ 400,00') === 40000);
  check('R$ 1.234,56 vira 123456', Core.centavosDeReais('R$ 1.234,56') === 123456);
  check('número do Excel 400 vira 40000', Core.centavosDeReais(400) === 40000);
  check('texto inválido (R$ 4a) vira nulo', Core.centavosDeReais('R$ 4a') === null);

  console.log('\nMédias → Domínio: nomes e casamento');
  check('normaliza: sem acento, maiúsculas, espaços simples', Core.normalizarNome('  josé  da   Silva ') === 'JOSE DA SILVA');
  const m1 = Core.casarEmpregados([{ matricula: '001', nome: 'Maria da Silva' }], LISTA);
  check('casamento exato: Maria da Silva vira código 101', m1.get('MARIA DA SILVA').tipo === 'exato' && m1.get('MARIA DA SILVA').codigo === '101');
  const m2 = Core.casarEmpregados([{ matricula: '001', nome: 'Maria' }], LISTA);
  check('nunca chuta: "Maria" (parte do nome) fica sem par', m2.get('MARIA').tipo === 'sem_par');
  const m3 = Core.casarEmpregados([{ matricula: '004', nome: 'Carlos Souza' }], LISTA);
  check('nome ambíguo (dois códigos) vira pendência, sem código', m3.get('CARLOS SOUZA').tipo === 'ambiguo' && !('codigo' in m3.get('CARLOS SOUZA')) &&
    m3.get('CARLOS SOUZA').candidatos.join() === '103,104');
  const m4 = Core.casarEmpregados([{ matricula: '001', nome: 'Ana Paula' }, { matricula: '009', nome: 'Ana Paula' }], LISTA);
  check('mesmo nome com matrículas diferentes na planilha vira ambíguo', m4.get('ANA PAULA').tipo === 'ambiguo');

  console.log('\nMédias → Domínio: Relação de Empregados (PDF, coluna do nome)');
  const CAB = [{ s: 'Código', x: 30, y: 700, w: 40 }, { s: 'Nome', x: 100, y: 700, w: 30 }, { s: 'Cargo', x: 300, y: 700, w: 30 }];
  const pagina = CAB.concat([
    { s: '101', x: 30, y: 680, w: 15 }, { s: 'MARIA', x: 100, y: 680, w: 35 }, { s: 'DA', x: 140, y: 680, w: 12 },
    { s: 'SILVA', x: 157, y: 680, w: 35 }, { s: 'AUXILIAR', x: 300, y: 680, w: 50 },
    { s: '102', x: 30, y: 660, w: 15 }, { s: 'JO', x: 100, y: 660, w: 12 }, { s: 'AO', x: 112, y: 660, w: 12 },
    { s: 'SANTOS', x: 126, y: 660, w: 40 }, { s: 'ANALISTA', x: 300, y: 660, w: 50 },
    { s: '103', x: 30, y: 640, w: 15 }, { s: 'CARLOS SOUZA', x: 100, y: 640, w: 230 }, { s: 'GERENTE', x: 300, y: 640, w: 50 }
  ]);
  const ext = Core.extrairEmpregadosDeItens([pagina]);
  check('extrai código e nome só da coluna do nome (cargo fora)', ext.empregados.length === 2 &&
    ext.empregados[0].codigo === '101' && ext.empregados[0].nome === 'MARIA DA SILVA' &&
    ext.empregados[1].codigo === '102' && ext.empregados[1].nome === 'JOAO SANTOS',
  JSON.stringify(ext.empregados));
  check('pedaços sem espaço entre eles viram uma palavra (JO + AO = JOAO)', ext.empregados[1].nome === 'JOAO SANTOS', ext.empregados[1].nome);
  const cruz = ext.pendencias.find(p => p.tipo === 'nome_e_cargo_no_mesmo_trecho');
  check('nome que cruza a coluna do cargo vira pendência, sem chute', !!cruz && cruz.codigo === '103' && ext.empregados.every(e => e.codigo !== '103'));
  let semCab = false;
  try { Core.extrairEmpregadosDeItens([[{ s: '101', x: 30, y: 680, w: 15 }, { s: 'MARIA', x: 100, y: 680, w: 35 }]]); } catch (e) { semCab = true; }
  check('PDF sem cabeçalho Código/Nome/Cargo é recusado', semCab);

  console.log('\nMédias → Domínio: planilha lida pelo cabeçalho');
  const lido = Core.lerLancamentos(XLSX, pasta(planilha(BASE)));
  const maria = lido.linhas[0];
  check('lê Maria: competência 09/2026, HE 50% = 7431 e Assiduidade = 40000', lido.linhas.length === 4 && maria.mm === '09' && maria.aaaa === '2026' &&
    maria.valores.find(v => v.coluna.cabecalho === 'HE 50% (h:mm)').valor === 7431 &&
    maria.valores.find(v => v.coluna.cabecalho === 'Assiduidade (R$)').valor === 40000);
  const semDsr = Core.lerLancamentos(XLSX, pasta(planilha(BASE, CABECALHO.filter(c => c !== 'DSR outros (R$)'))));
  check('coluna de valor ausente bloqueia (não sai sem ela)', semDsr.pendencias.some(p => p.tipo === 'coluna_ausente' && p.bloqueia));
  const compRuim = Core.lerLancamentos(XLSX, pasta(planilha([lin('005', 'Maria da Silva', '13/2026', { 'HE 50% (h:mm)': '1:00' })])));
  check('competência fora de MM/AAAA vira pendência e a linha não entra', compRuim.linhas.length === 0 && compRuim.pendencias.some(p => p.tipo === 'competencia_invalida'));
  const valRuim = Core.lerLancamentos(XLSX, pasta(planilha([lin('001', 'Maria da Silva', '09/2026', { 'Prêmio (R$)': 'R$ 4a' })])));
  check('valor que não se lê bloqueia com pendência', valRuim.pendencias.some(p => p.tipo === 'valor_invalido' && p.bloqueia));

  console.log('\nMédias → Domínio: formato da data');
  const sepOriginal = CFG_DATA.separador;
  CFG_DATA.separador = '-';
  const comHifen = Core.formatarData('09', '2026');
  CFG_DATA.separador = sepOriginal;
  check('separador de data vale para dia, mês e ano (01-09-2026)', comHifen === '01-09-2026', comHifen);
  check('formato padrão é 01/MM/AAAA', Core.formatarData('09', '2026') === '01/09/2026');

  console.log('\nMédias → Domínio: arquivo de importação (TXT)');
  const r = gerar(BASE);
  check('74:31 gera 7431 no arquivo (linha 7;101;01/09/2026;150;7431)', r.linhas.includes('7;101;01/09/2026;150;7431'), r.linhas.join(' | '));
  check('linhas exatas: empresa;codigo;01/MM/AAAA;rubrica;valor, só valores maiores que zero', JSON.stringify(r.linhas) === JSON.stringify(TXT_ESPERADO), JSON.stringify(r.linhas));
  check('sem cabeçalho e com fim de linha CRLF', r.texto === TXT_ESPERADO.join('\r\n') + '\r\n');
  check('sem nome sem par ou ambíguo no arquivo', !r.linhas.some(l => /;10[34];/.test(l)));
  check('sem par e ambíguo aparecem no relatório, sem bloquear', ['sem_par', 'ambiguo'].every(t => r.pendencias.some(p => p.tipo === t && !p.bloqueia)));
  check('totais: 4 linhas, 2 empregados, 150 soma 76:01', r.totais.linhas === 4 && r.totais.empregados === 2 &&
    Core.fmtHorasHM(r.totais.porRubrica.find(t => t.rubrica === '150').total) === '76:01');
  check('sem pendência bloqueante no caso base', r.bloqueado === false);

  const rub = gerar([lin('001', 'Maria da Silva', '09/2026', { 'HE 65% (h:mm)': '2:00' })]);
  check('rubrica sem código com valor: bloqueia e não gera placeholder', rub.bloqueado && rub.linhas.length === 0 &&
    rub.pendencias.some(p => p.tipo === 'rubrica_sem_codigo') && !rub.texto.includes('?'), JSON.stringify(rub.pendencias));
  const rubZero = gerar([lin('001', 'Maria da Silva', '09/2026', { 'HE 65% (h:mm)': '0:00' })]);
  check('rubrica sem código com valor zero não bloqueia', rubZero.bloqueado === false && rubZero.linhas.length === 0);
  const neg = gerar([lin('002', 'José Santos', '09/2026', { 'Prêmio (R$)': 'R$ -50,00' })]);
  check('valor negativo não entra no arquivo e não bloqueia', neg.linhas.length === 0 && neg.bloqueado === false &&
    neg.pendencias.some(p => p.tipo === 'valor_negativo'));
  const dup = gerar([lin('001', 'Maria da Silva', '09/2026', { 'HE 50% (h:mm)': '1:00' }), lin('001', 'Maria da Silva', '09/2026', { 'HE 50% (h:mm)': '2:00' })]);
  check('mesma rubrica e competência duas vezes: bloqueia', dup.bloqueado && dup.pendencias.some(p => p.tipo === 'lancamento_repetido'));
  const semEmp = gerar(BASE, { empresa: '' });
  check('sem código da empresa: bloqueia', semEmp.bloqueado && semEmp.pendencias.some(p => p.tipo === 'empresa_ausente'));

  // ---- Formato real (SYN-166): cada defeito tem o seu caso; se o defeito voltar, o caso falha ----
  // Um erro de leitura (ex.: cabeçalho não achado) vira resultado vazio, para a checagem falhar em vez de travar o runner.
  const seguro = (fn, nulo) => { try { return fn(); } catch (e) { return nulo; } };
  const SEM = { empregados: [], pendencias: [] };

  console.log('\nMédias → Domínio: formato real, cabeçalho "Código Nome" num texto só');
  const cabJunto = [{ s: 'Código Nome', x: 0, y: 700, w: 51 }, { s: 'Cargo', x: 160, y: 700, w: 30 }];
  const extCab = seguro(() => Core.extrairEmpregadosDeItens([cabJunto.concat([
    { s: '101', x: 0, y: 680, w: 15 }, { s: 'ADELSON DA COSTA', x: 32, y: 680, w: 100 }, { s: 'ENCARREGADO', x: 160, y: 680, w: 60 }])]), SEM);
  check('cabeçalho "Código Nome" num texto só é achado (código 101 e nome lidos)', extCab.empregados.length === 1 && extCab.empregados[0].codigo === '101' &&
    extCab.empregados[0].nome === 'ADELSON DA COSTA', JSON.stringify(extCab.empregados));

  console.log('\nMédias → Domínio: formato real, código e nome no mesmo texto');
  const extJunto = seguro(() => Core.extrairEmpregadosDeItens([cabJunto.concat([
    { s: '941 ADELSON DA COSTA', x: 0, y: 680, w: 112 }, { s: 'ENCARREGADO', x: 160, y: 680, w: 60 }])]), SEM);
  check('"941 ADELSON DA COSTA" num texto só vira código 941 e nome ADELSON DA COSTA', extJunto.empregados.length === 1 &&
    extJunto.empregados[0].codigo === '941' && extJunto.empregados[0].nome === 'ADELSON DA COSTA', JSON.stringify(extJunto.empregados));

  console.log('\nMédias → Domínio: formato real, planilha com cabeçalho "Competência"');
  const compSemMes = Core.lerLancamentos(XLSX, XLSX.read(GEN.gerarPlanilhaCompetencia(), { type: 'buffer' }));
  check('planilha com cabeçalho "Competência" (sem MM/AAAA) é lida: 11 linhas, competência 09/2026',
    compSemMes.pendencias.length === 0 && compSemMes.linhas.length === 11 && compSemMes.linhas[0].mm === '09' && compSemMes.linhas[0].aaaa === '2026',
    JSON.stringify(compSemMes.pendencias));
  const cabCompSemAcento = CABECALHO.map(c => (c === 'Competência MM/AAAA' ? 'COMPETENCIA' : c));
  const compCaixa = Core.lerLancamentos(XLSX, pasta(planilha([lin('001', 'Maria da Silva', '09/2026', { 'HE 50% (h:mm)': '1:00' })], cabCompSemAcento)));
  check('"COMPETENCIA" (sem acento e em maiúsculas) também é aceito', compCaixa.linhas.length === 1 && !compCaixa.pendencias.some(p => p.tipo === 'cabecalho_ausente'));

  console.log('\nMédias → Domínio: formato real, nome que avança sobre o cargo (prefixo de palavras)');
  const nomesPlanilha = GEN.PLANILHA_COMPETENCIA.map(p => p[1]);
  const extReal = seguro(() => Core.extrairEmpregadosDeItens([GEN.ITENS_FORMATO_REAL], nomesPlanilha), SEM);
  const lidosReal = extReal.empregados.length;
  check('PDF sintético: lê todos os empregados da Relação (10 de 10)', lidosReal === GEN.FORMATO_REAL.empregadosNoPdf, String(lidosReal));
  const nomeDe = cod => (extReal.empregados.find(e => e.codigo === cod) || {}).nome;
  check('nome que avança sobre o cargo vira o nome da planilha (301: "Marcos Antonio Pereira da Costa")', nomeDe('301') === 'Marcos Antonio Pereira da Costa', String(nomeDe('301')));
  check('nome partido em dois textos ("FRANCIELE FERREIRA DA" + "SILVA OPERADOR") vira "Franciele Ferreira da Silva"', nomeDe('304') === 'Franciele Ferreira da Silva', String(nomeDe('304')));
  check('prefixo mais longo: "ANA PAULA LIMA MONITORA DE CAIXA" fica com "Ana Paula Lima", não com "Ana Paula"', nomeDe('308') === 'Ana Paula Lima', String(nomeDe('308')));
  check('nenhuma linha do formato real fica como "nome e cargo juntos"', !extReal.pendencias.some(p => p.tipo === 'nome_e_cargo_no_mesmo_trecho'), JSON.stringify(extReal.pendencias));
  const semNomesPlanilha = seguro(() => Core.extrairEmpregadosDeItens([GEN.ITENS_FORMATO_REAL], ['Outra Pessoa']), SEM);
  check('sem nome da planilha que case, a linha que avança sobre o cargo continua pendência (sem chute)',
    semNomesPlanilha.pendencias.some(p => p.tipo === 'nome_e_cargo_no_mesmo_trecho' && p.codigo === '301') && !semNomesPlanilha.empregados.some(e => e.codigo === '301'));

  // Cruzamento com a planilha sintética do formato real
  const lidoReal = Core.lerLancamentos(XLSX, XLSX.read(GEN.gerarPlanilhaCompetencia(), { type: 'buffer' }));
  const casReal = Core.casarEmpregados(lidoReal.linhas, extReal.empregados);
  const tipoDe = nome => (casReal.get(Core.normalizarNome(nome)) || {}).tipo;
  const cruzados = Array.from(casReal.values()).filter(c => c.tipo === 'exato').length;
  const ambiguos = Array.from(casReal.values()).filter(c => c.tipo === 'ambiguo').map(c => c.nome);
  const semPar = Array.from(casReal.values()).filter(c => c.tipo === 'sem_par').map(c => c.nome);
  check('cruzaram com a planilha: 8 de 11 nomes', cruzados === GEN.FORMATO_REAL.cruzados && casReal.size === GEN.FORMATO_REAL.nomesPlanilha,
    cruzados + ' de ' + casReal.size);
  check('pendência ambígua: "Joao Pedro" tem dois empregados (309 e 310), sem código', tipoDe('Joao Pedro') === 'ambiguo' &&
    casReal.get('JOAO PEDRO').candidatos.join() === '309,310' && !('codigo' in casReal.get('JOAO PEDRO')), JSON.stringify(ambiguos));
  check('pendência sem par: só "Ana Paula" e "Carla Mendes"', semPar.length === 2 && semPar.includes('Ana Paula') && semPar.includes('Carla Mendes'), JSON.stringify(semPar));
  const txtReal = Core.gerarTxt({ empresa: '7', lancamentos: lidoReal.linhas, pendencias: lidoReal.pendencias, casamento: casReal });
  check('arquivo do formato real: uma linha por empregado cruzado, sem o ambíguo nem o sem par',
    JSON.stringify(txtReal.linhas) === JSON.stringify(GEN.FORMATO_REAL.txtLinhas) && txtReal.bloqueado === false, JSON.stringify(txtReal.linhas));
  check('pendências do formato real são só sem par e ambíguo (não bloqueiam)',
    txtReal.pendencias.length === 3 && txtReal.pendencias.every(p => (p.tipo === 'sem_par' || p.tipo === 'ambiguo') && !p.bloqueia));

  console.log('\nMédias → Domínio: formato real, resumo da leitura sintética');
  console.log('  PDF sintético: ' + lidosReal + ' empregado(s) lido(s) de ' + GEN.FORMATO_REAL.empregadosNoPdf + ' linha(s) de empregado');
  console.log('  cruzaram com a planilha sintética: ' + cruzados + ' de ' + casReal.size + ' nome(s)');
  console.log('  pendentes: sem par (' + semPar.join(', ') + '); ambíguo (' + ambiguos.join(', ') + ')');
};
