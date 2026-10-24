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
// SYN-184: 13º com Matrícula e férias sem Matrícula (cabeçalhos alternativos, abas extras)
const GEN2 = require(path.join(__dirname, '..', 'tests', 'smoke', 'medias-ferias-amostra.js'));

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
  // SYN-169: CARLOS SOUZA (103) passa da coluna do cargo, mas o GERENTE vem depois no fluxo: o nome é lido. Antes era pendência.
  check('extrai código e nome só da coluna do nome (cargo fora)', ext.empregados.length === 3 &&
    ext.empregados[0].codigo === '101' && ext.empregados[0].nome === 'MARIA DA SILVA' &&
    ext.empregados[1].codigo === '102' && ext.empregados[1].nome === 'JOAO SANTOS' &&
    ext.empregados[2].codigo === '103' && ext.empregados[2].nome === 'CARLOS SOUZA',
  JSON.stringify(ext.empregados));
  check('pedaços sem espaço entre eles viram uma palavra (JO + AO = JOAO)', ext.empregados[1].nome === 'JOAO SANTOS', ext.empregados[1].nome);
  // SYN-169: o texto que cruza a coluna do cargo não é mais pendência: o nome vem antes do primeiro texto do cargo
  const cruz = ext.pendencias.find(p => p.tipo === 'nome_e_cargo_no_mesmo_trecho');
  check('nome que cruza a coluna do cargo é lido até o texto do cargo (103 = CARLOS SOUZA, sem pendência)', !cruz &&
    ext.empregados.some(e => e.codigo === '103' && e.nome === 'CARLOS SOUZA'), JSON.stringify(ext.pendencias));
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
  // SYN-184: coluna ausente virou aviso (não bloqueia). Antes bloqueava; a mudança é pedida na tarefa.
  check('coluna de valor ausente vira aviso e não bloqueia (fica no relatório, o arquivo sai)', semDsr.avisos.some(p => p.tipo === 'coluna_ausente' && p.bloqueia === false) &&
    !semDsr.pendencias.some(p => p.tipo === 'coluna_ausente') &&
    Core.gerarTxt({ empresa: '7', lancamentos: semDsr.linhas, pendencias: semDsr.pendencias, casamento: Core.casarEmpregados(semDsr.linhas, LISTA) }).bloqueado === false);
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

  // ---- Ordem do fluxo (SYN-169): textos escritos na ordem do PDF, não por x ----
  console.log('\nMédias → Domínio: ordem do fluxo do PDF (nome antes da coluna do cargo)');
  const O = GEN.ORDEM_FLUXO;
  const lerOrdem = (itens, nomes) => seguro(() => Core.extrairEmpregadosDeItens([itens], nomes), SEM);
  const extOrdem = lerOrdem(GEN.ITENS_ORDEM_FLUXO, null);
  const nomesOrdem = cod => (extOrdem.empregados.find(e => e.codigo === cod) || {}).nome;
  check('ordem do fluxo sem planilha: lê os 5 empregados (a a d) e não lê o (e)', extOrdem.empregados.length === 5 &&
    Object.keys(O.nomesLidos).every(cod => nomesOrdem(cod) === O.nomesLidos[cod]), JSON.stringify(extOrdem.empregados));
  check('(a) nome partido cujo último pedaço ("FREITAS") invade a coluna do cargo: "ALEX LUCIANO CHAVES DE FREITAS"',
    nomesOrdem('601') === O.nomesLidos['601'], String(nomesOrdem('601')));
  check('(b) nome inteiro num texto que passa da coluna do cargo: "ELIAS DE JESUS SOUZA RODRIGUES"',
    nomesOrdem('602') === O.nomesLidos['602'], String(nomesOrdem('602')));
  check('(c) "DA" e "SILVA" antes de "OPERADOR" no fluxo, à direita dele por x: nome completo',
    nomesOrdem('603') === O.nomesLidos['603'], String(nomesOrdem('603')));
  check('(d) "SIQUEIRA" e "JACOBS" sobre a coluna do cargo entram no nome', nomesOrdem('604') === O.nomesLidos['604'] &&
    nomesOrdem('605') === O.nomesLidos['605'], JSON.stringify([nomesOrdem('604'), nomesOrdem('605')]));
  check('(e) linha sem nenhum texto na coluna do cargo continua pendência (nome e cargo juntos), sem entrar',
    !extOrdem.empregados.some(e => e.codigo === O.pendenteSemCargo) &&
    extOrdem.pendencias.some(p => p.tipo === 'nome_e_cargo_no_mesmo_trecho' && p.codigo === O.pendenteSemCargo),
  JSON.stringify(extOrdem.pendencias));
  check('a única pendência "nome e cargo juntos" é a do caso (e)', extOrdem.pendencias.filter(p => p.tipo === 'nome_e_cargo_no_mesmo_trecho').length === 1,
    JSON.stringify(extOrdem.pendencias));

  // Com a planilha: o prefixo de palavras reforça, e o cruzamento sai como esperado
  const extOrdemPl = lerOrdem(GEN.ITENS_ORDEM_FLUXO, GEN.PLANILHA_ORDEM_FLUXO.map(p => p[1]));
  const nomeOrdemPl = cod => (extOrdemPl.empregados.find(e => e.codigo === cod) || {}).nome;
  check('com a planilha: os 5 nomes lidos batem com os da planilha (mesmo nome normalizado)', extOrdemPl.empregados.length === 5 &&
    Object.keys(O.nomesLidos).every(cod => Core.normalizarNome(nomeOrdemPl(cod)) === O.nomesLidos[cod]), JSON.stringify(extOrdemPl.empregados));
  const lidoOrdem = Core.lerLancamentos(XLSX, XLSX.read(GEN.gerarPlanilhaOrdemFluxo(), { type: 'buffer' }));
  const casOrdem = Core.casarEmpregados(lidoOrdem.linhas, extOrdemPl.empregados);
  const cruzOrdem = Array.from(casOrdem.values()).filter(c => c.tipo === 'exato').length;
  const semParOrdem = Array.from(casOrdem.values()).filter(c => c.tipo === 'sem_par').map(c => c.nome);
  check('cruzaram com a planilha: 5 de 6 nomes, e só "Fulano Sem Par" fica sem par', cruzOrdem === O.cruzados &&
    casOrdem.size === GEN.PLANILHA_ORDEM_FLUXO.length && semParOrdem.join() === O.semPar.join(), cruzOrdem + ' de ' + casOrdem.size + ': ' + semParOrdem.join());
  check('nenhum nome do caso de ordem do fluxo fica ambíguo', !Array.from(casOrdem.values()).some(c => c.tipo === 'ambiguo'));
  check('pendência do caso (e) fica fora do TXT e não bloqueia', !lidoOrdem.pendencias.some(p => p.bloqueia) &&
    Core.gerarTxt({ empresa: '7', lancamentos: lidoOrdem.linhas, pendencias: lidoOrdem.pendencias, casamento: casOrdem }).bloqueado === false);

  // Sensibilidade: com os mesmos textos reordenados por x (a leitura antiga), o caso (c) sai diferente
  const porX = GEN.ITENS_ORDEM_FLUXO.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const extPorX = lerOrdem(porX, null);
  const nomePorX = cod => (extPorX.empregados.find(e => e.codigo === cod) || {}).nome;
  check('se os textos forem ordenados por x, o caso (c) muda (o teste pega a volta da ordenação)',
    nomePorX('603') !== O.nomesLidos['603'], String(nomePorX('603')));

  // ---- Igualdade exata e extensão (SYN-169, decisão do Pedro) ----
  // A planilha só pode ESTENDER o nome lido do PDF, nunca encurtá-lo. Uma extensão vale só com um candidato.
  console.log('\nMédias → Domínio: nome lido x nome da planilha (igualdade exata, extensão e travas)');
  const paginaNomes = CAB.concat([
    { s: '107', x: 30, y: 680, w: 15 }, { s: 'MARIA JOSE', x: 100, y: 680, w: 60 }, { s: 'ANALISTA', x: 300, y: 680, w: 50 },
    { s: '108', x: 30, y: 660, w: 15 }, { s: 'JOSE', x: 100, y: 660, w: 25 }, { s: 'OPERADOR', x: 300, y: 660, w: 50 }
  ]);
  const extMaria = seguro(() => Core.extrairEmpregadosDeItens([paginaNomes], ['Maria']), SEM);
  check('"Maria" (planilha) não casa com "MARIA JOSE" (PDF): a linha sai com o nome do PDF e "Maria" fica sem par',
    (extMaria.empregados.find(e => e.codigo === '107') || {}).nome === 'MARIA JOSE' &&
    Core.casarEmpregados([{ matricula: '001', nome: 'Maria' }], extMaria.empregados).get('MARIA').tipo === 'sem_par',
  JSON.stringify(extMaria.empregados));
  const extExato = seguro(() => Core.extrairEmpregadosDeItens([paginaNomes], ['Maria Jose']), SEM);
  const exatoM = extExato.empregados.find(e => e.codigo === '107') || {};
  check('igualdade exata: "Maria Jose" da planilha casa com "MARIA JOSE" e não é parcial', exatoM.nome === 'Maria Jose' && exatoM.parcial === false,
    JSON.stringify(exatoM));
  const extUnica = seguro(() => Core.extrairEmpregadosDeItens([paginaNomes], ['Jose Maria Silva']), SEM);
  const unicaJ = extUnica.empregados.find(e => e.codigo === '108') || {};
  const casUnica = Core.casarEmpregados([{ matricula: '002', nome: 'Jose Maria Silva' }], extUnica.empregados).get('JOSE MARIA SILVA');
  check('extensão única ("JOSE" do PDF + "Jose Maria Silva" da planilha) vale e sai marcada como parcial',
    unicaJ.nome === 'Jose Maria Silva' && unicaJ.parcial === true && casUnica.tipo === 'exato' && casUnica.parcial === true,
  JSON.stringify(unicaJ));
  const extAmbig = seguro(() => Core.extrairEmpregadosDeItens([paginaNomes], ['Jose Maria Silva', 'Jose Carlos Souza']), SEM);
  check('extensão com dois candidatos vira pendência ambígua (nome parcial), sem código',
    !extAmbig.empregados.some(e => e.codigo === '108') &&
    extAmbig.pendencias.some(p => p.tipo === 'nome_parcial_ambiguo' && p.codigo === '108'), JSON.stringify(extAmbig.pendencias));
  check('formato real: "FRANCIELE FERREIRA DA" + "SILVA OPERADOR" sai como parcial; "MARCOS..." (sem cargo no mesmo texto) não',
    seguro(() => Core.extrairEmpregadosDeItens([GEN.ITENS_FORMATO_REAL], GEN.PLANILHA_COMPETENCIA.map(p => p[1])), SEM).empregados
      .filter(e => e.parcial).map(e => e.codigo).join() === '304');

  // ---- SYN-184: planilha de férias junto com a do 13º (amostras sintéticas de tests/smoke/medias-ferias-amostra.js) ----
  const LISTA_FERIAS = [
    { codigo: '101', nome: 'Ana Teste Lima' }, { codigo: '102', nome: 'Bruno Teste Souza' },
    { codigo: '103', nome: 'Carla Teste Rocha' }, { codigo: '104', nome: 'Diego Teste Alves' }
  ];
  const lerWb = buf => XLSX.read(buf, { type: 'buffer' });
  const feriasCom = fn => GEN2.LINHAS_FERIAS.map(fn);
  // Mesmo texto de cabeçalho, sem acento e em maiúsculas (a comparação não diferencia)
  const semAcentoCaixa = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const linhaCaixa = l => Object.fromEntries(Object.keys(l).map(k => [semAcentoCaixa(k), l[k]]));

  console.log('\nMédias → Domínio: 13º e férias juntos (SYN-184)');
  const planilhasBase = () => [{ rotulo: '13º', wb: lerWb(GEN2.gerarPlanilhaDecimoTerceiro()) },
    { rotulo: 'férias', wb: lerWb(GEN2.gerarPlanilhaFerias()) }];
  const uniao = Core.unirPlanilhas(XLSX, planilhasBase());
  const casUniao = Core.casarEmpregados(uniao.linhas, LISTA_FERIAS);
  const txtUniao = Core.gerarTxt({ empresa: '7', lancamentos: uniao.linhas, pendencias: uniao.pendencias, casamento: casUniao });
  const rel13 = uniao.relatorio.find(r => r.rotulo === '13º');
  const relFerias = uniao.relatorio.find(r => r.rotulo === 'férias');

  check('13º: lê 3 linhas e 3 empregados, na aba "Lançamentos por competência" (a primeira aba "Totais" é ignorada)',
    rel13.linhasLidas === 3 && rel13.empregados === 3 && rel13.aba === 'Lançamentos por competência', JSON.stringify(rel13));
  check('férias sem Matrícula: lê 4 linhas e 3 empregados, na aba "Por competência" (Totais, Critérios e Complementação 2025 ignoradas)',
    relFerias.linhasLidas === 4 && relFerias.empregados === 3 && relFerias.aba === 'Por competência', JSON.stringify(relFerias));
  check('férias com cabeçalhos alternativos ("Assiduidade R$", "DSR horas extras R$") não tem coluna ausente',
    relFerias.colunasAusentes.length === 0, JSON.stringify(relFerias.colunasAusentes));
  check('13º sem a coluna DSR comissões: aviso (não bloqueia) com a rubrica listada',
    uniao.pendencias.length === 1 && uniao.pendencias[0].tipo === 'coluna_ausente' && uniao.pendencias[0].bloqueia === false &&
    uniao.pendencias[0].planilha === '13º' && uniao.pendencias[0].colunas.join() === 'DSR comissões', JSON.stringify(uniao.pendencias));
  check('sobreposição idêntica: 5 valores iguais (Ana 3, Bruno 2) entram uma vez e são contados como duplicatas removidas',
    uniao.duplicatasRemovidas === 5, String(uniao.duplicatasRemovidas));
  check('empregado sem Matrícula cruza pelo nome com o código da Relação (Ana Teste Lima = 101, exato)',
    casUniao.get('ANA TESTE LIMA').tipo === 'exato' && casUniao.get('ANA TESTE LIMA').codigo === '101', JSON.stringify(casUniao.get('ANA TESTE LIMA')));
  const TXT_UNIAO = ['7;101;01/09/2026;150;1000', '7;101;01/09/2026;236;10000', '7;101;01/09/2026;250;500',
    '7;102;01/09/2026;150;230', '7;102;01/09/2026;236;5000', '7;104;01/09/2026;236;8000', '7;104;01/09/2026;250;400',
    '7;101;01/12/2025;250;900'];
  check('TXT único: 13º e férias juntos, sem repetição (8 linhas, Ana 09/2026 não duplica)',
    JSON.stringify(txtUniao.linhas) === JSON.stringify(TXT_UNIAO) && txtUniao.bloqueado === false, JSON.stringify(txtUniao.linhas));
  check('ordem de leitura não muda o resultado: férias primeiro, 13º depois (mesmas 8 linhas)',
    JSON.stringify(Core.gerarTxt({ empresa: '7', lancamentos: Core.unirPlanilhas(XLSX, planilhasBase().reverse()).linhas,
      pendencias: [], casamento: casUniao }).linhas.slice().sort()) === JSON.stringify(TXT_UNIAO.slice().sort()));
  const ferUnica = Core.unirPlanilhas(XLSX, [{ rotulo: 'férias', wb: lerWb(GEN2.gerarPlanilhaFerias()) }]);
  check('uma só planilha (só férias) também passa pela junção, sem duplicatas', ferUnica.duplicatasRemovidas === 0 &&
    ferUnica.pendencias.length === 0 && ferUnica.linhas.length === 4);
  let dois = false;
  try { Core.unirPlanilhas(XLSX, [{ rotulo: 'a', wb: lerWb(GEN2.gerarPlanilhaFerias()) }, { rotulo: 'b', wb: lerWb(GEN2.gerarPlanilhaFerias()) }, { rotulo: 'c', wb: lerWb(GEN2.gerarPlanilhaFerias()) }]); } catch (e) { dois = true; }
  check('mais de duas planilhas é recusado', dois);

  console.log('\nMédias → Domínio: 13º e férias juntos, sobreposição com valor diferente (SYN-184)');
  const conflito = Core.unirPlanilhas(XLSX, [{ rotulo: '13º', wb: lerWb(GEN2.gerarPlanilhaDecimoTerceiro()) },
    { rotulo: 'férias', wb: lerWb(GEN2.gerarPlanilhaFerias(feriasCom(l => (l['Empregado'] === 'Bruno Teste Souza' && l['Competência (MM/AAAA)'] === '09/2026' ? Object.assign({}, l, { 'HE 50% (h:mm)': '2:45' }) : l)))) }]);
  const conf = conflito.pendencias.filter(p => p.tipo === 'conflito_entre_planilhas');
  check('valor diferente na mesma chave bloqueia com uma linha de conflito', conf.length === 1 && conf[0].bloqueia === true, JSON.stringify(conflito.pendencias));
  check('a diferença listada tem empregado, competência, rubrica e os dois valores (13º 2:30, férias 2:45)',
    conf.length === 1 && /Bruno Teste Souza/.test(conf[0].detalhe) && /09\/2026/.test(conf[0].detalhe) && /HE 50%/.test(conf[0].detalhe) &&
    /13º = 2:30/.test(conf[0].detalhe) && /férias = 2:45/.test(conf[0].detalhe), JSON.stringify(conf));
  const txtConflito = Core.gerarTxt({ empresa: '7', lancamentos: conflito.linhas, pendencias: conflito.pendencias,
    casamento: Core.casarEmpregados(conflito.linhas, LISTA_FERIAS) });
  check('com conflito o arquivo não sai (bloqueado)', txtConflito.bloqueado === true);

  console.log('\nMédias → Domínio: DSR comissões e casos de bloqueio (SYN-184)');
  const dscomComValor = gerarTxtDe(GEN2.gerarPlanilhaFerias(feriasCom(l => (l['Empregado'] === 'Diego Teste Alves' ? Object.assign({}, l, { 'DSR comissões R$': 'R$ 10,00' }) : l))));
  check('DSR comissões com valor maior que zero e sem código bloqueia', dscomComValor.bloqueado === true &&
    dscomComValor.pendencias.some(p => p.tipo === 'rubrica_sem_codigo' && /DSR comissões/.test(p.detalhe)), JSON.stringify(dscomComValor.pendencias));
  const dscomZero = gerarTxtDe(GEN2.gerarPlanilhaFerias());
  check('DSR comissões com valor zero não bloqueia (a coluna existe e está zerada)', dscomZero.bloqueado === false);
  const repetidoSemMatricula = Core.unirPlanilhas(XLSX, [{ rotulo: 'férias', wb: lerWb(GEN2.gerarPlanilhaFerias(
    feriasCom(l => l).concat([Object.assign({}, GEN2.LINHAS_FERIAS[2])]))) }]);
  check('sem matrícula, o mesmo nome e competência duas vezes na planilha bloqueia (nome repetido)',
    repetidoSemMatricula.pendencias.some(p => p.tipo === 'nome_repetido' && p.bloqueia === true), JSON.stringify(repetidoSemMatricula.pendencias));
  const abaUnica = Core.lerLancamentos(XLSX, lerWb(GEN2.gerarPlanilhaAbaUnica(GEN2.LINHAS_13)));
  check('planilha com uma aba de nome desconhecido: lê a primeira aba (Planilha1)', abaUnica.aba === 'Planilha1' && abaUnica.linhas.length === 3,
    abaUnica.aba + ' ' + abaUnica.linhas.length);
  const feriasCaixa = Core.lerLancamentos(XLSX, lerWb(GEN2.gerarPlanilha(GEN2.CABECALHO_FERIAS.map(semAcentoCaixa),
    GEN2.LINHAS_FERIAS.map(linhaCaixa), 'Por competência')));
  check('cabeçalhos sem acento e em maiúsculas ("COMPETENCIA (MM/AAAA)", "ASSIDUIDADE R$") são lidos',
    feriasCaixa.linhas.length === 4 && feriasCaixa.avisos.length === 0 && feriasCaixa.linhas[0].valores.find(v => v.coluna.rubrica === '236').valor === 10000,
    JSON.stringify(feriasCaixa.avisos));

  // Lê uma planilha de uma vez (a ferramenta lê uma planilha: a junção com a outra é em unirPlanilhas)
  function gerarTxtDe(buf) {
    const lido = Core.lerLancamentos(XLSX, lerWb(buf));
    return Core.gerarTxt({ empresa: '7', lancamentos: lido.linhas, pendencias: lido.pendencias, casamento: Core.casarEmpregados(lido.linhas, LISTA_FERIAS) });
  }
};
