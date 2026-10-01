(function (root) {
  'use strict';

  // Leitura do relatório do ponto (PDF). Recebe o objeto pdfjsLib já carregado.
  // Parte pura (parseReport) roda no navegador e no Node.

  const Y_TOL = 3; // itens com y até 3 pt de diferença formam a mesma linha

  async function extractLines(pdfjsLib, data) {
    const doc = await pdfjsLib.getDocument({
      data: data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false
    }).promise;
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items
        .filter(i => i.str && i.str.trim() !== '')
        .map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      items.forEach(it => {
        const row = rows.find(r => Math.abs(r.y - it.y) <= Y_TOL);
        if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
      });
      rows.sort((a, b) => b.y - a.y).forEach(r => {
        r.items.sort((a, b) => a.x - b.x);
        lines.push({ page: p, text: r.items.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim() });
      });
    }
    return lines;
  }

  // "6.654,13" -> 665413 (centésimos, inteiro)
  function parseCentesimos(s) {
    const m = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})$/.exec(String(s).trim());
    if (!m) return null;
    const dec = (m[2] + '0').slice(0, 2);
    return parseInt(m[1].replace(/\./g, ''), 10) * 100 + parseInt(dec, 10);
  }

  const RE_COLAB = /^(\d+) - (.+?) (Mensal|Horista|Semanal|Quinzenal|Diarista|Tarefa|Comissionista|\S+) (Ativo|Afastado|Férias|Ferias|Demitido|Rescindido|Licen[çc]a\S*|\S+)$/;
  const RE_EVENTO = /^(\d{5}) (.+?) (\d{1,3}(?:\.\d{3})*,\d{1,2}|\d+,\d{1,2}) Horas$/;
  const RE_FOLHA = /Folha:\s*(.+?)\s*$/;

  function parseReport(lines) {
    const res = {
      folha: null, vencimento: null, lancamento: null, empresa: null,
      colaboradores: [], desconhecidas: [], semColaborador: [],
      totais: {}, totalColaboradores: null
    };
    let atual = null;
    let cabecalho = false; // dentro do cabeçalho de página (até a linha "Código Descrição ...")
    let emTotais = false;
    let ultimaPagina = 0;
    lines.forEach(l => {
      const t = l.text;
      let m;
      if (l.page !== ultimaPagina) { ultimaPagina = l.page; cabecalho = true; }
      if (cabecalho) {
        if ((m = /Folha:\s*(.+)$/.exec(t)) && !res.folha) res.folha = m[1].trim();
        if (/Vencimento:/.test(t)) {
          const d = t.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
          if (!res.vencimento && d[0]) res.vencimento = d[0];
          if (!res.lancamento && d[1]) res.lancamento = d[1];
        }
        if (!res.empresa && (m = /^(\d+ - .+)$/.exec(t))) res.empresa = m[1];
        if (/^Código Descrição/.test(t)) cabecalho = false;
        return;
      }
      if ((m = /^Total: (\d+)$/.exec(t))) { res.totalColaboradores = parseInt(m[1], 10); return; }
      if ((m = /^Total dos VDBs (.*)$/.exec(t))) { emTotais = true; atual = null; }
      const ev = RE_EVENTO.exec(emTotais && m ? m[1] : t);
      if (ev) {
        const evento = { codigo: ev[1], descricao: ev[2], horasTexto: ev[3], centesimos: parseCentesimos(ev[3]), pagina: l.page };
        if (emTotais) res.totais[evento.codigo] = evento.centesimos;
        else if (!atual) res.semColaborador.push(evento);
        else atual.eventos.push(evento);
        return;
      }
      if (!emTotais && (m = RE_COLAB.exec(t))) {
        atual = { contrato: m[1], nome: m[2].trim(), tipoSalario: m[3], situacao: m[4], eventos: [], pagina: l.page };
        res.colaboradores.push(atual);
        return;
      }
      res.desconhecidas.push({ page: l.page, text: t });
    });
    return res;
  }
  const api = { extractLines, parseReport, parseCentesimos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PontoPdf = api;
})(typeof window !== 'undefined' ? window : this);
