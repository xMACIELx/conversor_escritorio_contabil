(function (root) {
  'use strict';

  // Regras puras da ferramenta Ponto -> Folha Domínio (navegador e Node).
  // Aritmética inteira: nenhuma conta com ponto flutuante sobre horas ou valores.

  const CFG = (typeof module !== 'undefined' && module.exports) ? require('./config.js') : root.PontoConfig;

  // ---------- conversões ----------
  function minutosDeCentesimos(c) { return Math.floor((c * 60 + 50) / 100); }

  // Retorna { dias (inteiro mais próximo), fecha, zerou, centDias (centésimos de dia) }
  function diasDeCentesimos(c, divCent) {
    const dias = Math.floor((2 * c + divCent) / (2 * divCent));
    const fecha = Math.abs(c - dias * divCent) * 100 <= CFG.TOLERANCIA_DIA_CENT * divCent;
    return {
      dias: dias, fecha: fecha, zerou: c > 0 && dias === 0,
      centDias: Math.floor((c * 200 + divCent) / (2 * divCent))
    };
  }

  function fmtCent(c) {                     // 665413 -> "6.654,13"
    const int = Math.floor(c / 100), dec = String(c % 100).padStart(2, '0');
    return String(int).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  }
  function fmtValorCelula(n) { return fmtCent(n * 100); } // 48 -> "48,00" (como o Excel mostra #,##0.00)

  // Eventos em "Horas" da Domínio: o valor é H,MM (2,24 = 2h24), não horas decimais nem minutos totais.
  // minutos totais -> centésimos do número H,MM (inteiro): 144 -> 224; 4214 -> 7014
  function horasMinutosCent(totalMin) { return Math.floor(totalMin / 60) * 100 + (totalMin % 60); }
  function fmtHHMM(totalMin) { return Math.floor(totalMin / 60) + ':' + String(totalMin % 60).padStart(2, '0'); }

  // ---------- nomes ----------
  function normalizeName(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  // Casa relatório -> planilha. rows: [{r, nome}] da planilha.
  // Retorna array alinhado a colaboradores: { tipo: 'exato'|'aprox'|'sem', row, nomePlanilha, motivo }
  function casarColaboradores(colaboradores, rows) {
    const porNome = new Map();
    rows.forEach(rw => {
      const k = normalizeName(rw.nome);
      if (!porNome.has(k)) porNome.set(k, []);
      porNome.get(k).push(rw);
    });
    const res = colaboradores.map(() => null);
    const usadas = new Set();
    colaboradores.forEach((c, i) => {
      const lst = porNome.get(normalizeName(c.nome));
      if (lst && lst.length === 1) { res[i] = { tipo: 'exato', row: lst[0].r, nomePlanilha: lst[0].nome }; usadas.add(lst[0].r); }
      else if (lst && lst.length > 1) res[i] = { tipo: 'sem', row: null, motivo: 'nome repetido na planilha' };
    });
    const ehPrefixo = (a, b) => a.length < b.length && b.startsWith(a + ' ');
    const prop = new Map(); // linha -> índices que a propõem
    colaboradores.forEach((c, i) => {
      if (res[i]) return;
      const n = normalizeName(c.nome), pn = n.split(' ');
      const cands = rows.filter(rw => {
        if (usadas.has(rw.r)) return false;
        const m = normalizeName(rw.nome), pm = m.split(' ');
        if (ehPrefixo(n, m)) return pn.length >= 2;
        if (ehPrefixo(m, n)) return pm.length >= 2;
        return false;
      });
      if (cands.length === 1) {
        res[i] = { tipo: 'aprox', row: cands[0].r, nomePlanilha: cands[0].nome };
        if (!prop.has(cands[0].r)) prop.set(cands[0].r, []);
        prop.get(cands[0].r).push(i);
      } else {
        res[i] = { tipo: 'sem', row: null, motivo: cands.length ? 'vários nomes parecidos na planilha' : 'não encontrado na planilha' };
      }
    });
    prop.forEach(idxs => { // mesma linha proposta a 2+ pessoas: ambíguo
      if (idxs.length > 1) idxs.forEach(i => { res[i] = { tipo: 'sem', row: null, motivo: 'ambíguo: mais de um nome do relatório aponta para a mesma linha' }; });
    });
    return res;
  }

  // ---------- tipo de cálculo ----------
  function tipoDeFolha(folha) {
    const n = normalizeName(folha);
    const t = CFG.TIPOS_CALCULO.find(x => x.re.test(n));
    return t ? t.tipo : null;
  }

  // ---------- leitura da planilha (regra do .jar) ----------
  const digitos = s => String(s == null ? '' : s).replace(/\D/g, '');

  function textoCelula(x) {
    if (!x || x.t === 'z' || x.v === undefined || x.v === null) return '';
    if (x.w !== undefined) return String(x.w);
    return String(x.v);
  }

  function lerCompetencia(XLSX, x) {
    const t = textoCelula(x);
    const m = /(\d{1,2})\/(\d{4})/.exec(t);
    if (m) return { mm: m[1].padStart(2, '0'), aaaa: m[2] };
    if (x && x.t === 'n' && XLSX && XLSX.SSF) {
      const d = XLSX.SSF.parse_date_code(x.v);
      if (d) return { mm: String(d.m).padStart(2, '0'), aaaa: String(d.y) };
    }
    return null;
  }

  // Lê tudo o que o .jar lê, usando o texto exibido das células.
  function lerGrade(XLSX, ws) {
    const E = XLSX.utils.encode_cell;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const colunas = [];
    for (let c = CFG.PRIMEIRA_COLUNA_EVENTOS; c < CFG.PRIMEIRA_COLUNA_EVENTOS + CFG.MAX_COLUNAS_EVENTOS; c++) {
      const cod = ws[E({ r: CFG.LINHA_CODIGOS - 1, c })];
      colunas.push({
        c: c, codigo: digitos(textoCelula(cod)),
        nome: textoCelula(ws[E({ r: CFG.LINHA_NOMES - 1, c })]),
        vazia: !cod || cod.t === 'z' || cod.v === undefined || cod.v === null || cod.v === ''
      });
    }
    const linhas = [];
    for (let r = CFG.PRIMEIRA_LINHA_DADOS - 1; r <= range.e.r; r++) {
      const tipo = digitos(textoCelula(ws[E({ r, c: 0 })]));
      if (tipo === '' || !CFG.TIPOS_LIDOS.includes(parseInt(tipo, 10))) continue;
      linhas.push({
        r: r + 1, tipo: parseInt(tipo, 10), codigoFolha: digitos(textoCelula(ws[E({ r, c: 1 })])),
        nome: textoCelula(ws[E({ r, c: 2 })]).trim(),
        valores: colunas.map(col => textoCelula(ws[E({ r, c: col.c })]))
      });
    }
    return {
      empresa: digitos(textoCelula(ws['C3'])),
      competencia: lerCompetencia(XLSX, ws['C6']),
      colunas: colunas, linhas: linhas
    };
  }

  // ---------- gerador do .txt (regra do .jar, byte a byte) ----------
  // Retorna { linhas: [43 caracteres cada], problemas: [..] }
  function gerarTxt(grade) {
    const out = [], problemas = [];
    const comp = grade.competencia ? grade.competencia.aaaa + grade.competencia.mm : '';
    const emp = grade.empresa.padStart(10, '0');
    grade.linhas.forEach(l => {
      grade.colunas.forEach((col, i) => {
        if (col.codigo === '') return;
        const d = digitos(l.valores[i]);
        if (d === '' || parseInt(d, 10) === 0) return;
        if (d.length > 9) problemas.push('Valor com mais de 9 dígitos: linha ' + l.r + ', evento ' + col.codigo);
        out.push('10' + l.codigoFolha.padStart(10, '0') + comp + col.codigo.padStart(4, '0') +
          String(l.tipo).padStart(2, '0') + d.padStart(9, '0') + emp);
      });
    });
    return { linhas: out, problemas: problemas };
  }

  const TXT_EOL = '\r\n';
  const txtComoTexto = linhas => linhas.map(l => l + TXT_EOL).join('');

  // ---------- plano de preenchimento ----------
  function agregarEventos(colab) {
    const m = new Map();
    colab.eventos.forEach(e => {
      const a = m.get(e.codigo) || { codigo: e.codigo, descricao: e.descricao, centesimos: 0 };
      a.centesimos += e.centesimos;
      m.set(e.codigo, a);
    });
    return Array.from(m.values());
  }

  // decisoes[i] = { tipo, row, confirmado, codigoManual }
  function incluido(d) {
    if (!d) return false;
    if (d.tipo === 'exato') return true;
    if (d.tipo === 'aprox') return !!d.confirmado;
    return digitos(d.codigoManual) !== '';
  }

  function construirPlano(report, decisoes, divisores) {
    const itens = [], naoMapeados = [], naoFecham = [], zerados = [], conferencia = [], duplicados = [], vistos = new Set();
    const mapa = new Map(CFG.EVENTOS.map(e => [e.origem, e]));
    report.colaboradores.forEach((c, i) => {
      const d = decisoes[i], inc = incluido(d);
      agregarEventos(c).forEach(a => {
        const map = mapa.get(a.codigo);
        const base = { colab: i, nome: c.nome, origem: a.codigo, descricao: a.descricao, horas: a.centesimos };
        if (!map) {
          naoMapeados.push(base);
          conferencia.push(Object.assign(base, { status: 'naomapeado' }));
          return;
        }
        // cent = valor da célula em centésimos inteiros (célula = cent / 100, formato #,##0.00)
        let cent, minutos = null, dias = null, fecha = true, zerou = false, centDias = null;
        if (map.unidade === 'horas') {          // horas + minutos: 144 min -> 2,24 (2h24)
          minutos = minutosDeCentesimos(a.centesimos);
          cent = horasMinutosCent(minutos);
        } else {
          const r = diasDeCentesimos(a.centesimos, divisores[map.divisor]);
          dias = r.dias; cent = dias * 100; fecha = r.fecha; zerou = r.zerou; centDias = r.centDias;
        }
        const linha = Object.assign(base, { evento: map.evento, unidade: map.unidade, cent, minutos, dias, fecha, zerou, centDias });
        if (!inc) linha.status = d && d.tipo === 'aprox' ? 'aguardando' : 'pulado';
        else linha.status = zerou ? 'zerou' : (fecha ? 'ok' : 'naofecha');
        conferencia.push(linha);
        if (!inc) return;
        const chave = i + '|' + map.evento;
        if (vistos.has(chave)) duplicados.push(linha);
        vistos.add(chave);
        if (!fecha) naoFecham.push(linha);
        if (zerou) zerados.push(linha);
        if (cent > 0) itens.push(linha);
      });
    });
    return { itens, naoMapeados, naoFecham, zerados, conferencia, duplicados };
  }

  // ---------- aplicar na planilha ----------
  function setNum(XLSX, ws, r, c, cent) {
    // v = cent / 100 (um único número decimal montado de inteiros); w = texto exibido, que o .jar lê
    ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', v: cent / 100, z: CFG.FORMATO_VALOR, w: fmtCent(cent) };
  }

  // Garante uma coluna para cada evento necessário. Retorna { mapa: codigo -> coluna, criadas }.
  function resolverColunas(XLSX, ws, grade, codigosNecessarios) {
    const mapa = new Map(), criadas = [];
    const E = XLSX.utils.encode_cell;
    grade.colunas.forEach(col => {
      const k = col.codigo.padStart(4, '0');
      if (col.codigo !== '' && !mapa.has(k)) mapa.set(k, col.c);
    });
    codigosNecessarios.forEach(cod => {
      if (mapa.has(cod)) return;
      const livre = grade.colunas.find(col => col.vazia || col.codigo === '999' || col.codigo === '9999');
      if (!livre) throw new Error('Não há coluna livre na planilha para o evento ' + cod);
      const nome = CFG.NOMES_COLUNA_NOVA[cod] || ('Evento ' + cod);
      ws[E({ r: CFG.LINHA_CODIGOS - 1, c: livre.c })] = { t: 'n', v: parseInt(cod, 10), z: '0000', w: cod };
      ws[E({ r: CFG.LINHA_NOMES - 1, c: livre.c })] = { t: 's', v: nome, w: nome };
      criadas.push({ evento: cod, coluna: XLSX.utils.encode_col(livre.c), nome: nome });
      livre.codigo = cod; livre.vazia = false;
      mapa.set(cod, livre.c);
    });
    return { mapa, criadas };
  }

  // Insere linhas de colaboradores sem correspondência (com código digitado) antes da linha de totais,
  // para os dados ficarem contíguos. Retorna os números de linha (1-based).
  function inserirLinhas(XLSX, ws, novas, tipoCalculo) {
    if (!novas.length) return [];
    const range = XLSX.utils.decode_range(ws['!ref']);
    let totalR = -1;
    for (let r = range.e.r; r >= CFG.PRIMEIRA_LINHA_DADOS - 1 && totalR < 0; r--) {
      for (let c = 0; c <= range.e.c; c++) {
        const x = ws[XLSX.utils.encode_cell({ r, c })];
        if (x && x.f) { totalR = r; break; }
      }
    }
    const k = novas.length;
    let primeira;
    if (totalR >= 0) {
      const chaves = Object.keys(ws).filter(a => a[0] !== '!' && XLSX.utils.decode_cell(a).r >= totalR);
      const cel = chaves.map(a => [XLSX.utils.decode_cell(a), ws[a]]);
      chaves.forEach(a => delete ws[a]);
      cel.forEach(([p, x]) => {
        if (x.f) x.f = x.f.replace(/([A-Z]+)(\d+):([A-Z]+)(\d+)/, (m, a, b, c, d) => a + b + ':' + c + (parseInt(d, 10) + k));
        ws[XLSX.utils.encode_cell({ r: p.r + k, c: p.c })] = x;
      });
      primeira = totalR;
    } else primeira = range.e.r + 1;
    range.e.r += k;
    const linhas = [];
    novas.forEach((n, j) => {
      const r = primeira + j;
      const cod = String(parseInt(digitos(n.codigo), 10));
      ws[XLSX.utils.encode_cell({ r, c: 0 })] = { t: 'n', v: tipoCalculo, z: 'General', w: String(tipoCalculo) };
      ws[XLSX.utils.encode_cell({ r, c: 1 })] = { t: 'n', v: parseInt(cod, 10), z: '@', w: cod };
      ws[XLSX.utils.encode_cell({ r, c: 2 })] = { t: 's', v: n.nome, w: n.nome };
      linhas.push(r + 1);
    });
    ws['!ref'] = XLSX.utils.encode_range(range);
    return linhas;
  }

  // Mantém os totais (fórmulas SUM) coerentes com os valores preenchidos.
  function recalcularTotais(XLSX, ws) {
    Object.keys(ws).forEach(a => {
      if (a[0] === '!') return;
      const x = ws[a];
      const m = x && x.f && /^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/.exec(x.f);
      if (!m || m[1] !== m[3]) return;
      const col = XLSX.utils.decode_col(m[1]);
      let soma = 0;
      for (let r = parseInt(m[2], 10) - 1; r <= parseInt(m[4], 10) - 1; r++) {
        const y = ws[XLSX.utils.encode_cell({ r, c: col })];
        if (y && y.t === 'n') soma += y.v;
      }
      x.v = soma; x.w = fmtCent(soma * 100);
    });
  }

  // Aplica o plano na planilha (altera wb). Preenche it.row / it.col em cada item do plano.
  function aplicarNaPlanilha(XLSX, wb, report, decisoes, plano, tipoCalculo) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const grade0 = lerGrade(XLSX, ws);
    const necessarios = Array.from(new Set(plano.itens.map(i => i.evento)));
    const { mapa, criadas } = resolverColunas(XLSX, ws, grade0, necessarios);
    const porCodigo = new Map();
    grade0.linhas.forEach(l => { if (l.codigoFolha !== '') porCodigo.set(parseInt(l.codigoFolha, 10), l.r); });
    const rowDe = new Map(), novas = [];
    report.colaboradores.forEach((c, i) => {
      const d = decisoes[i];
      if (!incluido(d)) return;
      if (d.tipo === 'sem') {
        const cod = parseInt(digitos(d.codigoManual), 10);
        if (porCodigo.has(cod)) rowDe.set(i, porCodigo.get(cod));   // código já existe na planilha: usa a linha
        else novas.push({ i, nome: c.nome.toUpperCase(), codigo: cod });
      } else rowDe.set(i, d.row);
    });
    const novasLinhas = inserirLinhas(XLSX, ws, novas, tipoCalculo);
    novas.forEach((n, j) => rowDe.set(n.i, novasLinhas[j]));
    plano.itens.forEach(it => {
      it.row = rowDe.get(it.colab);
      it.col = mapa.get(it.evento);
      setNum(XLSX, ws, it.row - 1, it.col, it.cent);
    });
    recalcularTotais(XLSX, ws);
    return { grade: lerGrade(XLSX, ws), criadas, linhasNovas: novasLinhas };
  }

  // ---------- validações ----------
  // ctx: { report, grade0, plano, decisoes, ap, txt }  ->  [{ nivel: 'ok'|'aviso'|'erro'|'info', label, detail }]
  function validar(ctx) {
    const v = [];
    const add = (nivel, label, detail) => v.push({ nivel, label, detail });
    const { report, grade0, plano, decisoes, ap, txt } = ctx;

    if (!grade0.empresa) add('erro', 'Código da empresa', 'A célula C3 da planilha está vazia.');
    if (!grade0.competencia) add('erro', 'Competência da planilha', 'Não consegui ler a competência (célula C6).');

    // competência x mês do relatório
    const mv = /^\d{2}\/(\d{2})\/(\d{4})$/.exec(report.vencimento || '');
    if (grade0.competencia && mv) {
      const rel = mv[1] + '/' + mv[2], pla = grade0.competencia.mm + '/' + grade0.competencia.aaaa;
      if (rel === pla) add('ok', 'Competência', 'Planilha e relatório são de ' + pla + '.');
      else add('aviso', 'Competência diferente', 'A planilha é de ' + pla + ' e o relatório é de ' + rel +
        '. O arquivo sairá com a competência da planilha (' + pla + ').');
    } else if (grade0.competencia) add('aviso', 'Competência', 'Não encontrei o vencimento no relatório para comparar com a planilha.');

    // tipo de cálculo
    const esperado = tipoDeFolha(report.folha);
    const tiposPlan = Array.from(new Set(grade0.linhas.map(l => l.tipo)));
    if (esperado === null) add('erro', 'Tipo de cálculo', 'Folha "' + (report.folha || '?') + '" do relatório não é reconhecida.');
    else if (tiposPlan.length === 1 && tiposPlan[0] === esperado) add('ok', 'Tipo de cálculo', 'Folha "' + report.folha + '" = ' + esperado + ', igual ao da planilha.');
    else add('erro', 'Tipo de cálculo', 'Relatório "' + report.folha + '" = ' + esperado + ', mas a planilha tem o(s) tipo(s) ' + tiposPlan.join(', ') + '.');

    // leitura do PDF x totais impressos no próprio relatório
    const somaPdf = {};
    report.colaboradores.forEach(c => c.eventos.forEach(e => { somaPdf[e.codigo] = (somaPdf[e.codigo] || 0) + e.centesimos; }));
    const cods = Object.keys(report.totais || {});
    if (cods.length) {
      const dif = cods.filter(k => somaPdf[k] !== report.totais[k]).concat(Object.keys(somaPdf).filter(k => !(k in report.totais)));
      if (dif.length) add('erro', 'Leitura do relatório', 'A soma das horas lidas não confere com o "Total dos VDBs" do relatório nos eventos: ' + dif.join(', ') + '. O PDF pode não ter sido lido por inteiro.');
      else add('ok', 'Leitura do relatório', 'A soma das horas lidas confere com o "Total dos VDBs" impresso no relatório (' + cods.length + ' eventos).');
    } else add('aviso', 'Leitura do relatório', 'O relatório não traz o bloco "Total dos VDBs"; não foi possível conferir a leitura.');

    // eventos não mapeados
    if (plano.naoMapeados.length) {
      const porEv = {};
      plano.naoMapeados.forEach(n => { porEv[n.origem + ' ' + n.descricao] = (porEv[n.origem + ' ' + n.descricao] || 0) + 1; });
      add('erro', 'Eventos do relatório sem mapeamento', 'Estes eventos NÃO entram no arquivo: ' +
        Object.keys(porEv).map(k => k + ' (' + porEv[k] + ' lançamentos)').join('; ') + '. Avise o desenvolvedor com estes códigos.');
    }

    // conflitos de linha
    const usadas = new Map();
    plano.itens.forEach(i => { if (!usadas.has(i.row)) usadas.set(i.row, new Set()); usadas.get(i.row).add(i.colab); });
    const conflitos = Array.from(usadas.entries()).filter(e => e[1].size > 1);
    if (conflitos.length) add('erro', 'Mesma linha para mais de uma pessoa', 'Linhas da planilha usadas por duas pessoas do relatório: ' + conflitos.map(e => e[0]).join(', '));

    // .txt x plano
    const somaTxt = {}, somaPlano = {};
    txt.linhas.forEach(l => { const ev = l.substr(18, 4); somaTxt[ev] = (somaTxt[ev] || 0) + parseInt(l.substr(24, 9), 10); });
    plano.itens.forEach(i => { somaPlano[i.evento] = (somaPlano[i.evento] || 0) + i.cent; });
    const evs = Array.from(new Set(Object.keys(somaTxt).concat(Object.keys(somaPlano)))).sort();
    const difEv = evs.filter(k => (somaTxt[k] || 0) !== (somaPlano[k] || 0));
    if (txt.linhas.length === 0) add('erro', 'Nenhum lançamento gerado', 'O arquivo .txt ficou vazio: nenhum evento do relatório virou lançamento (veja os avisos acima e a tabela de conferência). Não há o que baixar.');
    else if (difEv.length) add('erro', 'Soma por evento', 'A soma do .txt não bate com a conversão do relatório nos eventos: ' + difEv.join(', ') +
      '. (Se a planilha já tinha valores digitados, eles também entram no arquivo.)');
    else add('ok', 'Soma por evento', 'A soma de cada evento no .txt é igual à soma convertida do relatório (' + evs.join(', ') + ').');
    if (txt.linhas.length === 0) { /* já sinalizado em 'Nenhum lançamento gerado' */ }
    else if (txt.linhas.length !== plano.itens.length) add('erro', 'Contagem de linhas', 'O .txt tem ' + txt.linhas.length + ' linhas, mas o relatório gerou ' + plano.itens.length + ' lançamentos.');
    else add('ok', 'Contagem de linhas', txt.linhas.length + ' linhas no .txt, uma por lançamento.');
    txt.problemas.forEach(p => add('erro', 'Valor grande demais', p));
    if (txt.linhas.some(l => l.length !== 43)) add('erro', 'Tamanho das linhas', 'Há linhas do .txt que não têm 43 caracteres.');

    if (plano.duplicados.length) add('erro', 'Evento repetido para a mesma pessoa', 'Dois eventos do relatório viram o mesmo evento da Domínio para: ' + plano.duplicados.map(d => d.nome + ' (' + d.evento + ')').join('; ') + '. O relatório mistura os dois layouts de código?');

    // colaboradores
    let inc = 0, ign = 0, agu = 0;
    decisoes.forEach(d => { if (incluido(d)) inc++; else if (d.tipo === 'aprox') agu++; else ign++; });
    const total = decisoes.length;
    add(ign || agu ? 'aviso' : 'ok', 'Colaboradores do relatório',
      inc + ' incluídos, ' + ign + ' ignorados (sem correspondência), ' + agu + ' aguardando confirmação, de ' + total + '.');

    if (plano.zerados.length) add('aviso', 'Valor que viraria zero', plano.zerados.length + ' lançamento(s) com horas arredondam para 0 dia e não entram no arquivo: ' +
      plano.zerados.map(z => z.nome + ' (' + z.origem + ': ' + fmtCent(z.horas) + ' h)').join('; '));
    if (plano.naoFecham.length) add('aviso', 'Dias que não fecham inteiro', plano.naoFecham.length + ' lançamento(s) em amarelo na conferência: foram arredondados para o dia inteiro mais próximo. Revise.');
    if (ap.criadas.length) add('info', 'Coluna criada na planilha', ap.criadas.map(c => 'Evento ' + c.evento + ' na coluna ' + c.coluna + ' ("' + c.nome + '")').join('; '));
    if (ap.linhasNovas.length) add('info', 'Linhas adicionadas na planilha', ap.linhasNovas.length + ' colaborador(es) com código digitado foram acrescentados antes da linha de totais.');
    return v;
  }

  const api = {
    validar, minutosDeCentesimos, horasMinutosCent, fmtHHMM, diasDeCentesimos, fmtCent, fmtValorCelula, normalizeName, casarColaboradores,
    tipoDeFolha, lerGrade, gerarTxt, txtComoTexto, agregarEventos, incluido, construirPlano,
    aplicarNaPlanilha, digitos, textoCelula, lerCompetencia, TXT_EOL
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PontoCore = api;
})(typeof window !== 'undefined' ? window : this);
