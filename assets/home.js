(function () {
  'use strict';

  const PAGE_TITLE = 'Conversores de folha';

  const titleEl = document.getElementById('home-title');
  if (titleEl) {
    titleEl.textContent = PAGE_TITLE;
  }
  document.title = PAGE_TITLE;

  const grid = document.getElementById('tools-grid');
  if (!grid || !Array.isArray(window.TOOLS)) return;

  grid.textContent = '';

  window.TOOLS.forEach(tool => {
    const isReady = tool.status === 'pronto';

    const card = document.createElement(isReady ? 'a' : 'div');
    card.className = 'tool-card' + (isReady ? '' : ' disabled');
    if (isReady) {
      card.href = tool.caminho;
      card.setAttribute('aria-label', 'Abrir ferramenta ' + tool.nome);
    }

    const header = document.createElement('div');
    header.className = 'tool-card-header';
    const title = document.createElement('h2');
    title.className = 'tool-card-title';
    title.textContent = tool.nome;
    header.appendChild(title);

    const flow = document.createElement('div');
    flow.className = 'tool-flow';

    const chipDe = document.createElement('span');
    chipDe.className = 'tool-chip';
    chipDe.textContent = tool.de;

    const arrow = document.createElement('span');
    arrow.className = 'tool-flow-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    const chipPara = document.createElement('span');
    chipPara.className = 'tool-chip';
    chipPara.textContent = tool.para;

    flow.append(chipDe, arrow, chipPara);

    const desc = document.createElement('p');
    desc.className = 'tool-desc';
    desc.textContent = tool.descricao;

    const foot = document.createElement('div');
    foot.className = 'tool-card-footer';

    if (isReady) {
      const btn = document.createElement('span');
      btn.className = 'btn btn-tool';
      btn.textContent = 'Abrir';
      foot.appendChild(btn);
    } else {
      const badge = document.createElement('span');
      badge.className = 'tool-badge-soon';
      badge.textContent = 'Em breve';
      foot.appendChild(badge);
    }

    card.append(header, flow, desc, foot);
    grid.appendChild(card);
  });
})();
