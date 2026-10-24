(function (root) {
  'use strict';

  // Regras puras da ferramenta Médias → Domínio (navegador e Node).
  // Aritmética inteira: R$ em centavos e horas em H,MM (74:31 vira 7431, sem ponto flutuante).
  // Nada aqui acessa a rede. O SheetJS e o pdf.js chegam por parâmetro (vendor/), nunca são baixados.

  const CFG = (typeof module !== 'undefined' && module.exports) ? require('./config.js') : root.MediasConfig;

  const digitos = s => String(s == null ? '' : s).replace(/\D/g, '');
  const texto = x => (x == null ? '' : String(x)).trim();
  const pad2 = n => String(n).padStart(2, '0');

  // ---------- nomes ----------
  function normalizarNome(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  // Casa cada empregado da planilha com a lista {codigo, nome} lida da Relação de Empregados.
  // Só casa nome igual depois de normalizar. Sem par ou com mais de um candidato vira pendência: nunca chuta.
  // lancamentos: [{ matricula, nome }]. Retorna Map(nomeNormalizado -> { tipo, nome, codigo | candidatos, motivo })
  // tipo: 'exato' | 'sem_par' | 'ambiguo'
  function casarEmpregados(lancamentos, lista) {
    const porNome = new Map();
    lista.forEach(e => {
      const k = normalizarNome(e.nome);
      if (!porNome.has(k)) porNome.set(k, []);
      porNome.get(k).push(e);
    });
    const grupos = new Map(); // nome normalizado -> { nome, matriculas: Set }
    lancamentos.forEach(l => {
      const k = normalizarNome(l.nome);
      if (!grupos.has(k)) grupos.set(k, { nome: texto(l.nome), matriculas: new Set() });
      if (texto(l.matricula) !== '') grupos.get(k).matriculas.add(texto(l.matricula)); // matrícula em branco não conta (planilha de férias)
    });
    const res = new Map();
    grupos.forEach((g, k) => {
      if (k === '') { res.set(k, { tipo: 'sem_par', nome: g.nome, motivo: 'linha sem nome' }); return; }
      if (g.matriculas.size > 1) {
        res.set(k, { tipo: 'ambiguo', nome: g.nome, motivo: 'o mesmo nome aparece com matrículas diferentes na planilha' });
        return;
      }
      const cands = porNome.get(k) || [];
      if (cands.length === 1) res.set(k, { tipo: 'exato', nome: g.nome, codigo: cands[0].codigo, parcial: !!cands[0].parcial });
      else if (cands.length > 1) res.set(k, { tipo: 'ambiguo', nome: g.nome, candidatos: cands.map(c => c.codigo), motivo: 'mais de um empregado com este nome na Relação' });
      else res.set(k, { tipo: 'sem_par', nome: g.nome, motivo: 'nome não encontrado na Relação de Empregados' });
    });
    return res;
  }

  // ---------- Relação de Empregados (PDF) ----------
  // Agrupa itens de texto em linhas pelo y. itens: [{ s, x, y, w }] (w = largura; opcional)
  // Dentro de cada linha, os itens ficam na ordem do fluxo do arquivo (a ordem do pdf.js), não por x:
  // o nome pode ser escrito em pedaços fora da ordem da coluna (ver extrairEmpregadosDeItens).
  function agruparLinhas(itens) {
    const linhas = [];
    itens.filter(i => texto(i.s) !== '').forEach(i => {
      const item = { s: texto(i.s), x: i.x, y: i.y, w: i.w || 0 };
      const l = linhas.find(r => Math.abs(r.y - item.y) <= CFG.TOLERANCIA_Y_PT);
      if (l) l.items.push(item); else linhas.push({ y: item.y, items: [item] });
    });
    return linhas.sort((a, b) => b.y - a.y).map(l => ({ items: l.items }));
  }

  // Posição das colunas Código, Nome e Cargo na linha de cabeçalho (ou null se não for o cabeçalho).
  // Aceita "Código" e "Nome" em textos separados, ou "Código Nome" num texto só: aí o x do Nome sai da
  // proporção de caracteres do texto (o pdf.js entrega o cabeçalho assim).
  function acharCabecalho(itens) {
    const C = CFG.CABECALHO_RELACAO;
    const ach = nome => itens.find(i => normalizarNome(i.s) === normalizarNome(nome));
    const g = ach(C.cargo);
    const juntos = ach(C.codigoNome);
    if (juntos && g) {
      const partes = /^(\S+)(\s+)(\S+)$/.exec(texto(juntos.s));
      if (partes) {
        const antes = partes[1].length + partes[2].length;
        return { codigo: juntos.x, nome: juntos.x + juntos.w * antes / texto(juntos.s).length, cargo: g.x };
      }
    }
    const c = ach(C.codigo), n = ach(C.nome);
    return c && n && g ? { codigo: c.x, nome: n.x, cargo: g.x } : null;
  }

  // Linha de empregado com código e nome no mesmo texto ("941 ADELSON DA COSTA"): o código vira item próprio
  // e o nome começa na coluna do nome (cab.nome), com a largura que sobra do texto original.
  function separarCodigoNome(itens, cab) {
    const T = CFG.TOLERANCIA_X_PT;
    const saida = [];
    itens.forEach(i => {
      const m = /^(\d+)\s+(\S.*)$/.exec(texto(i.s));
      if (!m || !(i.x < cab.nome - T)) { saida.push(i); return; }
      saida.push({ s: m[1], x: i.x, w: 0 });
      saida.push({ s: m[2], x: cab.nome, w: Math.max(0, i.x + i.w - cab.nome) });
    });
    return saida;
  }

  // Nome da planilha que casa com o texto da linha do PDF (nome + primeiras palavras do cargo).
  // Casa quando o texto é igual ao nome ou começa com ele seguido de espaço. Escolhe o mais longo.
  function nomeDaPlanilhaNoTexto(textoLinha, nomes) {
    const t = normalizarNome(textoLinha);
    let melhor = null;
    nomes.forEach(n => {
      if ((t === n.norm || t.startsWith(n.norm + ' ')) && (!melhor || n.norm.length > melhor.norm.length)) melhor = n;
    });
    return melhor;
  }

  // Junta os pedaços de um nome; só põe espaço quando há folga entre um pedaço e o seguinte.
  function juntarTexto(itens) {
    let t = '', fim = null;
    itens.forEach(i => {
      if (fim !== null && i.x - fim > CFG.ESPACO_ENTRE_ITENS_PT) t += ' ';
      t += i.s;
      fim = i.x + i.w;
    });
    return t.replace(/\s+/g, ' ').trim();
  }

  // paginas: [ [ { s, x, y, w } ] ] (um array de itens por página, na ordem do fluxo do pdf.js).
  // O nome de cada linha são os textos da linha, na ordem do fluxo, ANTES do primeiro texto que começa na coluna
  // do cargo (x dentro da tolerância). Os textos seguintes (cargo, categoria) não entram.
  // nomesPlanilha (opcional): nomes da planilha de apuração. Com a planilha, o nome lido só casa por igualdade exata
  // ou por extensão (um nome da planilha que começa com o nome lido + espaço; marcado parcial: true). Ver o bloco abaixo.
  // Sem nenhum texto na coluna do cargo, só o prefixo de palavras da planilha separa o nome; sem casamento, pendência.
  // Sem nomesPlanilha, o comportamento é só o de separar a coluna do nome.
  // Retorna { empregados: [{ codigo, nome, pagina, parcial }], pendencias: [{ tipo, pagina, codigo, detalhe }] }
  function extrairEmpregadosDeItens(paginas, nomesPlanilha) {
    const empregados = [], pendencias = [], vistos = new Set();
    const T = CFG.TOLERANCIA_X_PT;
    const nomes = (nomesPlanilha || []).map(n => ({ original: texto(n), norm: normalizarNome(n) })).filter(n => n.norm !== '');
    const adicionar = (codigo, nome, pagina, parcial) => {
      const chave = codigo + '|' + normalizarNome(nome);
      if (vistos.has(chave)) return;
      vistos.add(chave);
      empregados.push({ codigo, nome, pagina, parcial: !!parcial });
    };
    let cab = null;
    paginas.forEach((itens, p) => {
      const pagina = p + 1;
      agruparLinhas(itens).forEach(linha => {
        const achado = acharCabecalho(linha.items);
        if (achado) { cab = achado; return; }
        if (!cab) return;
        const it = separarCodigoNome(linha.items, cab);
        const cod = it.find(i => /^\d+$/.test(i.s) && i.x < cab.nome - T);
        if (!cod) return; // título, rodapé, totais: não é linha de empregado
        const daNome = it.filter(i => i !== cod && i.x >= cab.nome - T); // ordem do fluxo
        const ini = daNome.findIndex(i => Math.abs(i.x - cab.cargo) <= T); // primeiro texto na coluna do cargo
        if (ini < 0) {
          // Sem nenhum texto na coluna do cargo: só o prefixo de palavras da planilha separa o nome (como antes)
          const casado = nomes.length ? nomeDaPlanilhaNoTexto(juntarTexto(daNome), nomes) : null;
          if (casado) { adicionar(cod.s, casado.original, pagina); return; }
          pendencias.push({ tipo: 'nome_e_cargo_no_mesmo_trecho', pagina, codigo: cod.s,
            detalhe: 'Nenhum texto começa na coluna do cargo. Não separei o nome; confira esta linha no PDF.' });
          return;
        }
        const nome = juntarTexto(daNome.slice(0, ini));
        if (nome === '') { pendencias.push({ tipo: 'codigo_sem_nome', pagina, codigo: cod.s, detalhe: 'Código sem nome na mesma linha.' }); return; }
        // Com a planilha: igualdade exata primeiro. Sem igual, a planilha só pode ESTENDER o nome lido
        // (o nome do PDF é início de palavras do nome da planilha), nunca encurtá-lo.
        // Uma única extensão vale, marcada como parcial; duas ou mais viram pendência ambígua.
        if (nomes.length) {
          const norm = normalizarNome(nome);
          const exato = nomes.find(n => n.norm === norm);
          if (exato) { adicionar(cod.s, exato.original, pagina); return; }
          const extensoes = nomes.filter(n => n.norm.startsWith(norm + ' '));
          if (extensoes.length > 1) {
            pendencias.push({ tipo: 'nome_parcial_ambiguo', pagina, codigo: cod.s,
              detalhe: 'O nome "' + nome + '" do PDF é início de ' + extensoes.length + ' nomes da planilha (' +
                extensoes.map(n => n.original).join(', ') + '). Não cruzei; confira.' });
            return;
          }
          if (extensoes.length === 1) { adicionar(cod.s, extensoes[0].original, pagina, true); return; }
        }
        adicionar(cod.s, nome, pagina);
      });
    });
    if (!cab) throw new Error('Não achei o cabeçalho "Código / Nome / Cargo" no PDF. É a Relação de Empregados da Domínio?');
    return { empregados, pendencias };
  }

  // Lê o PDF com o pdf.js já carregado (pdfjsLib, de vendor/). Sem rede: data é o próprio arquivo em bytes.
  // nomesPlanilha: ver extrairEmpregadosDeItens.
  async function lerRelacaoPdf(pdfjsLib, data, nomesPlanilha) {
    const doc = await pdfjsLib.getDocument({
      data: data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false
    }).promise;
    const paginas = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      paginas.push(tc.items.map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 })));
    }
    return extrairEmpregadosDeItens(paginas, nomesPlanilha);
  }

  // ---------- conversão de valores (inteiro) ----------
  // "R$ 400,00" -> 40000 (centavos). Aceita número (já lido pelo SheetJS). Vazio ou inválido -> null.
  function centavosDeReais(x) {
    if (x === null || x === undefined || x === '') return null;
    if (typeof x === 'number') return Number.isFinite(x) ? Math.round(x * 100) : null;
    const m = /^(-)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(texto(x).replace(/R\$\s*/, ''));
    if (!m) return null;
    const cent = m[3] === undefined ? 0 : parseInt((m[3] + '0').slice(0, 2), 10);
    const v = parseInt(m[2].replace(/\./g, ''), 10) * 100 + cent;
    return m[1] ? -v : v;
  }

  // "74:31" -> 7431 (H,MM como inteiro: horas*100 + minutos). Minutos 00 a 59. Aceita mais de 24 h e a duração
  // do Excel (fração do dia, lida como número). Vazio ou inválido -> null.
  function horasHM(x) {
    if (x === null || x === undefined || x === '') return null;
    if (typeof x === 'number') {
      if (!Number.isFinite(x) || x < 0) return null;
      const min = Math.round(x * 1440);
      return Math.floor(min / 60) * 100 + (min % 60);
    }
    const m = /^(\d+):([0-5]\d)$/.exec(texto(x));
    return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : null;
  }

  // 7431 -> 4471 minutos (para somar horas sem o erro de base 60 do H,MM)
  function minutosDeHM(hm) { return Math.floor(hm / 100) * 60 + (hm % 100); }

  const fmtReais = c => {                    // 40000 -> "R$ 400,00"
    const neg = c < 0 ? '-' : '', a = Math.abs(c);
    return neg + 'R$ ' + String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + pad2(a % 100);
  };
  const fmtHorasHM = min => Math.floor(min / 60) + ':' + pad2(min % 60); // 4561 -> "76:01"

  // "09/2026" -> { mm: '09', aaaa: '2026' }; mês fora de 01 a 12 -> null
  function lerCompetencia(x) {
    const m = /^\s*(\d{1,2})\/(\d{4})\s*$/.exec(texto(x));
    if (!m) return null;
    const mm = parseInt(m[1], 10);
    return mm < 1 || mm > 12 ? null : { mm: pad2(mm), aaaa: m[2] };
  }

  function formatarData(mm, aaaa) { const s = CFG.FORMATO_DATA.separador; return CFG.FORMATO_DATA.dia + s + mm + s + aaaa; }

  // ---------- planilha de apuração (SheetJS, por cabeçalho) ----------
  // Aba: a que se chama "Lançamentos por competência" ou "Por competência"; sem nenhuma delas, a primeira.
  // As outras abas (Totais, Critérios, Complementação etc.) não são lidas.
  function escolherAba(wb) {
    const aceitas = CFG.ABAS_ACEITAS.map(normalizarNome);
    return wb.SheetNames.find(n => aceitas.includes(normalizarNome(n))) || wb.SheetNames[0];
  }

  // Lê a aba escolhida e acha a linha de cabeçalho. Retorna { linhas, pendencias, avisos, aba, colunasAusentes }.
  // linhas: [{ linha, matricula, nome, mm, aaaa, valores: [{ coluna, valor, bruto }] }]
  // valor: inteiro (7431 ou 40000), 0, negativo, ou null quando a célula não é lida (aí há pendência).
  // Matrícula é opcional. Coluna de rubrica ausente vira aviso (avisos), não bloqueio: o relatório lista quais.
  function lerLancamentos(XLSX, wb) {
    const pendencias = [], avisos = [], linhas = [];
    const P = CFG.CABECALHO_PLANILHA;
    // a competência aceita "Competência MM/AAAA", "Competência (MM/AAAA)" e "Competência" (sem acento e sem maiúsculas)
    const compAceitas = [P.competencia].concat(P.competenciaAlternativas || []).map(normalizarNome);
    const empAceito = normalizarNome(P.empregado);
    const aba = escolherAba(wb);
    const grade = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: null });
    const h = grade.findIndex(r => { const n = r.map(normalizarNome); return n.includes(empAceito) && compAceitas.some(a => n.includes(a)); });
    if (h < 0) {
      pendencias.push({ tipo: 'cabecalho_ausente', bloqueia: true, detalhe: 'Não achei a linha com "Empregado" e "Competência" na aba "' + aba + '".' });
      return { linhas, pendencias, avisos, aba, colunasAusentes: [] };
    }
    const cab = { linha: h, nomes: grade[h].map(normalizarNome) };
    // primeira coluna que bater com um dos nomes (o principal e as alternativas)
    const colunaDe = nomes => {
      for (const n of nomes) { const i = cab.nomes.indexOf(normalizarNome(n)); if (i >= 0) return i; }
      return -1;
    };
    const iMat = colunaDe([P.matricula]), iEmp = colunaDe([P.empregado]), iComp = colunaDe(compAceitas);
    const colunas = CFG.COLUNAS.map(c => ({ c, i: colunaDe([c.cabecalho].concat(c.alternativas || [])) }));
    const ausentes = colunas.filter(x => x.i < 0).map(x => x.c.descricao);
    if (ausentes.length) {
      avisos.push({ tipo: 'coluna_ausente', bloqueia: false, colunas: ausentes,
        detalhe: 'Coluna(s) sem cabeçalho nesta planilha: ' + ausentes.join(', ') + '. Essas rubricas ficam sem valor vindo desta planilha; confira se era para ter.' });
    }
    const sheetRange = XLSX.utils.decode_range(wb.Sheets[aba]['!ref'] || 'A1');
    const nomesComCompetencia = new Map(); // só para linhas sem matrícula: nome + competência -> linha da primeira
    for (let r = cab.linha + 1; r < grade.length; r++) {
      const lin = grade[r];
      const at = i => (i < 0 ? null : lin[i]);
      const numLinha = sheetRange.s.r + r + 1;
      const matricula = texto(at(iMat)), nome = texto(at(iEmp)), comp = at(iComp);
      const todos = colunas.map(({ i }) => at(i)).concat([at(iMat), at(iEmp), comp]);
      if (todos.every(x => texto(x) === '')) continue;      // linha em branco
      const competencia = lerCompetencia(comp);
      if (!competencia) { pendencias.push({ tipo: 'competencia_invalida', bloqueia: true, linha: numLinha, nome, detalhe: 'Competência "' + texto(comp) + '" não está no formato MM/AAAA.' }); continue; }
      if (nome === '') { pendencias.push({ tipo: 'linha_incompleta', bloqueia: true, linha: numLinha, nome, detalhe: 'Linha sem nome do empregado.' }); continue; }
      if (matricula === '') {
        // sem matrícula não dá para separar dois empregados com o mesmo nome: nome repetido na mesma competência bloqueia
        const chave = normalizarNome(nome) + '|' + competencia.mm + '/' + competencia.aaaa;
        if (nomesComCompetencia.has(chave)) {
          pendencias.push({ tipo: 'nome_repetido', bloqueia: true, linha: numLinha, nome, detalhe: 'Mesmo nome e competência já aparecem na linha ' + nomesComCompetencia.get(chave) + ', e a planilha não tem matrícula para separar. Confira qual é o empregado.' });
        } else nomesComCompetencia.set(chave, numLinha);
      }
      const valores = colunas.map(({ c, i }) => {
        const bruto = at(i);
        const valor = c.tipo === 'horas' ? horasHM(bruto) : centavosDeReais(bruto);
        if (valor === null && texto(bruto) !== '') {
          pendencias.push({ tipo: 'valor_invalido', bloqueia: true, linha: numLinha, nome, detalhe: '"' + c.descricao + '" tem o valor "' + texto(bruto) + '", que não consigo ler.' });
        }
        return { coluna: c, valor, bruto: texto(bruto) };
      });
      linhas.push({ linha: numLinha, matricula, nome, mm: competencia.mm, aaaa: competencia.aaaa, valores });
    }
    return { linhas, pendencias, avisos, aba, colunasAusentes: ausentes };
  }

  // ---------- junção de uma ou duas planilhas ----------
  // planilhas: [{ rotulo, wb }] (1 ou 2; o rótulo aparece no relatório e nas pendências, ex.: "13º", "férias").
  // Chave de cada valor: empregado (nome normalizado) + competência + rubrica (a coluna da config).
  // Mesma chave e mesmo valor nas duas planilhas: entra uma vez e conta em duplicatasRemovidas (só valores maiores que zero,
  // que virariam linha no TXT). Mesma chave com valor diferente: bloqueia e lista a diferença.
  // Retorna { linhas, relatorio: [{ rotulo, aba, linhasLidas, empregados, colunasAusentes }], pendencias, duplicatasRemovidas }.
  // linhas tem o formato de lerLancamentos e vai direto para gerarTxt.
  function unirPlanilhas(XLSX, planilhas) {
    if (!planilhas || planilhas.length < 1 || planilhas.length > 2) throw new Error('Informe uma ou duas planilhas de apuração.');
    const relatorio = [], pendencias = [], linhas = [], vistos = new Map();
    let duplicatasRemovidas = 0;
    const fmt = (coluna, valor) => (coluna.tipo === 'horas' ? fmtHorasHM(minutosDeHM(valor)) : fmtReais(valor));
    planilhas.forEach((p, idx) => {
      const lido = lerLancamentos(XLSX, p.wb);
      relatorio.push({
        rotulo: p.rotulo, aba: lido.aba, linhasLidas: lido.linhas.length,
        empregados: new Set(lido.linhas.map(l => normalizarNome(l.nome))).size, colunasAusentes: lido.colunasAusentes
      });
      lido.pendencias.concat(lido.avisos).forEach(x => pendencias.push(Object.assign({ planilha: p.rotulo }, x)));
      lido.linhas.forEach(l => {
        const valores = [];
        l.valores.forEach(v => {
          const chave = normalizarNome(l.nome) + '|' + l.mm + '/' + l.aaaa + '|' + v.coluna.descricao;
          const valor = v.valor === null ? 0 : v.valor;
          const antes = vistos.get(chave);
          if (!antes) { vistos.set(chave, { idx, valor, v, planilha: p.rotulo }); valores.push(v); return; }
          if (antes.idx === idx) { valores.push(v); return; } // repetição na mesma planilha: gerarTxt bloqueia
          if (antes.valor === valor) { if (valor > 0) duplicatasRemovidas++; return; }
          pendencias.push({ tipo: 'conflito_entre_planilhas', bloqueia: true, linha: l.linha, nome: l.nome, planilha: p.rotulo,
            detalhe: 'Empregado ' + l.nome + ', competência ' + l.mm + '/' + l.aaaa + ', "' + v.coluna.descricao + '": ' +
              antes.planilha + ' = ' + fmt(v.coluna, antes.valor) + ', ' + p.rotulo + ' = ' + fmt(v.coluna, valor) + '. Confira qual está certo antes de gerar.' });
        });
        linhas.push(Object.assign({}, l, { valores }));
      });
    });
    return { linhas, relatorio, pendencias, duplicatasRemovidas };
  }

  // ---------- arquivo de importação ----------
  // Gera uma linha por empregado, competência e rubrica com valor maior que zero.
  // Sem cabeçalho, separador ';', empresa;codigo;01/MM/AAAA;rubrica;valor. Nunca gera placeholder.
  // opts: { empresa, lancamentos, pendencias (de lerLancamentos), casamento (de casarEmpregados) }
  // Retorna { linhas, texto, pendencias, totais, bloqueado }. Com bloqueado = true, não ofereça o arquivo.
  function gerarTxt(opts) {
    const pendencias = (opts.pendencias || []).slice();
    const linhas = [], vistos = new Set(), porRubrica = new Map(), codigos = new Set();
    const emp = digitos(opts.empresa);
    if (emp === '') pendencias.push({ tipo: 'empresa_ausente', bloqueia: true, detalhe: 'Informe o código da empresa na tela.' });

    opts.casamento.forEach(c => {
      if (c.tipo === 'exato') return;
      const motivo = c.tipo === 'ambiguo' && c.candidatos
        ? 'mais de um código para este nome (' + c.candidatos.join(', ') + ')'
        : c.motivo;
      pendencias.push({ tipo: c.tipo, bloqueia: false, nome: c.nome, detalhe: motivo + '. Fica de fora do arquivo.' });
    });

    opts.lancamentos.forEach(l => {
      const c = opts.casamento.get(normalizarNome(l.nome));
      if (!c || c.tipo !== 'exato') return;
      const base = c.codigo + '|' + l.mm + '/' + l.aaaa;
      l.valores.forEach(v => {
        if (v.valor === null || v.valor === 0) return;
        if (v.valor < 0) {
          pendencias.push({ tipo: 'valor_negativo', bloqueia: false, linha: l.linha, nome: l.nome, detalhe: '"' + v.coluna.descricao + '" é negativo. Não entra no arquivo; confira na planilha.' });
          return;
        }
        const rub = v.coluna.rubrica;
        if (!rub) {
          pendencias.push({ tipo: 'rubrica_sem_codigo', bloqueia: true, linha: l.linha, nome: l.nome, detalhe: '"' + v.coluna.descricao + '" tem valor, mas não tem código de rubrica. Informe o código na configuração.' });
          return;
        }
        const chave = base + '|' + rub;
        if (vistos.has(chave)) {
          pendencias.push({ tipo: 'lancamento_repetido', bloqueia: true, linha: l.linha, nome: l.nome, detalhe: 'Rubrica ' + rub + ' repetida para este empregado e competência.' });
          return;
        }
        vistos.add(chave);
        linhas.push([emp, c.codigo, formatarData(l.mm, l.aaaa), rub, String(v.valor)].join(CFG.SEPARADOR_TXT));
        codigos.add(c.codigo);
        if (!porRubrica.has(rub)) porRubrica.set(rub, { rubrica: rub, descricao: v.coluna.descricao, unidade: v.coluna.tipo, linhas: 0, total: 0 });
        const t = porRubrica.get(rub);
        t.linhas++;
        t.total += v.coluna.tipo === 'horas' ? minutosDeHM(v.valor) : v.valor;
      });
    });

    const totais = { linhas: linhas.length, empregados: codigos.size, porRubrica: Array.from(porRubrica.values()) };
    return {
      linhas: linhas,
      texto: linhas.map(l => l + CFG.FIM_DE_LINHA).join(''),
      pendencias: pendencias,
      totais: totais,
      bloqueado: pendencias.some(p => p.bloqueia)
    };
  }

  const api = {
    normalizarNome, casarEmpregados, agruparLinhas, extrairEmpregadosDeItens, lerRelacaoPdf,
    centavosDeReais, horasHM, minutosDeHM, fmtReais, fmtHorasHM, lerCompetencia, formatarData,
    lerLancamentos, unirPlanilhas, gerarTxt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MediasCore = api;
})(typeof window !== 'undefined' ? window : this);
