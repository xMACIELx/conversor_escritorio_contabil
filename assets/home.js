(function () {
  'use strict';

  const PAGE_TITLE = 'Conversores de folha';
  // Só ids de ferramenta e a data do uso. Nenhum dado de arquivo é guardado.
  const CHAVE = 'conversores-home';
  const RECENTES_MAX = 4;

  // Funções puras: sem DOM, para teste em Node (test/home.js).

  // Minúsculas e sem acento: "médias" acha "medias", "NCM" acha "ncm".
  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  function filtrar(ferramentas, grupos, termo) {
    const partes = normalizar(termo).split(/\s+/).filter(Boolean);
    if (!partes.length) return ferramentas.slice();
    return ferramentas.filter(tool => {
      const grupo = grupos.find(g => g.id === tool.grupo);
      const texto = normalizar([
        tool.nome, tool.descricao, tool.de, tool.para,
        grupo ? grupo.titulo : '',
        (tool.palavras || []).join(' ')
      ].join(' '));
      return partes.every(parte => texto.includes(parte));
    });
  }

  // Grupos na ordem de GRUPOS, sem grupos vazios. Ferramenta com grupo desconhecido vai para "Outras".
  function agrupar(ferramentas, grupos) {
    const secoes = grupos.map(g => ({
      id: g.id,
      titulo: g.titulo,
      ferramentas: ferramentas.filter(tool => tool.grupo === g.id)
    }));
    const conhecidos = new Set(grupos.map(g => g.id));
    const outras = ferramentas.filter(tool => !conhecidos.has(tool.grupo));
    if (outras.length) secoes.push({ id: 'outras', titulo: 'Outras', ferramentas: outras });
    return secoes.filter(s => s.ferramentas.length > 0);
  }

  // Ferramentas na ordem de ids (ex.: ordem de recência). Ids desconhecidos e repetidos são descartados.
  function ordenarPorIds(ferramentas, ids) {
    return [...new Set(ids)]
      .map(id => ferramentas.find(tool => tool.id === id))
      .filter(Boolean);
  }

  // Testa de verdade: em alguns navegadores o localStorage existe mas lança erro ao gravar.
  function armazenamentoDisponivel(armazenamento) {
    try {
      armazenamento.setItem('__teste__', '1');
      armazenamento.removeItem('__teste__');
      return true;
    } catch (e) {
      return false;
    }
  }

  function lerEstado(armazenamento) {
    const vazio = { favoritos: [], recentes: [] };
    try {
      const dados = JSON.parse(armazenamento.getItem(CHAVE) || 'null');
      if (!dados || typeof dados !== 'object') return vazio;
      return {
        favoritos: Array.isArray(dados.favoritos)
          ? [...new Set(dados.favoritos.filter(id => typeof id === 'string'))]
          : [],
        recentes: Array.isArray(dados.recentes)
          ? dados.recentes.filter(r => r && typeof r.id === 'string')
          : []
      };
    } catch (e) {
      return vazio;
    }
  }

  function gravarEstado(armazenamento, estado) {
    try {
      armazenamento.setItem(CHAVE, JSON.stringify(estado));
      return true;
    } catch (e) {
      return false;
    }
  }

  function alternarFavorito(estado, id) {
    const favoritos = estado.favoritos.includes(id)
      ? estado.favoritos.filter(f => f !== id)
      : estado.favoritos.concat(id);
    return Object.assign({}, estado, { favoritos });
  }

  function registrarUso(estado, id, agora) {
    const recentes = [{ id, quando: agora }]
      .concat(estado.recentes.filter(r => r.id !== id))
      .slice(0, RECENTES_MAX);
    return Object.assign({}, estado, { recentes });
  }

  const API = {
    CHAVE, RECENTES_MAX,
    normalizar, filtrar, agrupar, ordenarPorIds,
    armazenamentoDisponivel, lerEstado, gravarEstado, alternarFavorito, registrarUso
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
  if (typeof document === 'undefined') return;

  // Página

  const titleEl = document.getElementById('home-title');
  if (titleEl) {
    titleEl.textContent = PAGE_TITLE;
  }
  document.title = PAGE_TITLE;

  const lista = document.getElementById('tools-lista');
  const busca = document.getElementById('busca');
  const status = document.getElementById('busca-status');
  const limpar = document.getElementById('busca-limpar');
  if (!lista || !busca || !Array.isArray(window.TOOLS) || !Array.isArray(window.GRUPOS)) return;

  const tools = window.TOOLS;
  const grupos = window.GRUPOS;

  function armazenamentoDoNavegador() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }

  const arm = armazenamentoDoNavegador();
  const armOk = arm !== null && armazenamentoDisponivel(arm);

  const ESTRELA_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>';

  function criarEstrela(tool, estado) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'btn-fav';
    botao.dataset.id = tool.id;
    botao.setAttribute('aria-pressed', String(estado.favoritos.includes(tool.id)));
    botao.setAttribute('aria-label', 'Favoritar ' + tool.nome);
    botao.innerHTML = ESTRELA_SVG;
    botao.addEventListener('click', () => {
      gravarEstado(arm, alternarFavorito(lerEstado(arm), tool.id));
      render();
      // A tela foi redesenhada: devolve o foco à estrela da mesma ferramenta.
      const again = lista.querySelector('.btn-fav[data-id="' + tool.id + '"]');
      if (again) again.focus();
    });
    return botao;
  }

  function criarCard(tool, estado) {
    const isReady = tool.status === 'pronto';

    const wrap = document.createElement('div');
    wrap.className = 'tool-wrap';

    const card = document.createElement(isReady ? 'a' : 'div');
    card.className = 'tool-card' + (isReady ? '' : ' disabled');
    if (isReady) {
      card.href = tool.caminho;
      card.setAttribute('aria-label', 'Abrir ferramenta ' + tool.nome);
      card.addEventListener('click', () => {
        gravarEstado(arm, registrarUso(lerEstado(arm), tool.id, Date.now()));
      });
    }

    const header = document.createElement('div');
    header.className = 'tool-card-header';
    const title = document.createElement('h3');
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
    wrap.appendChild(card);
    // A estrela fica fora do link (botão dentro de <a> é inválido). Só ferramentas que abrem têm estrela.
    if (isReady && armOk) wrap.appendChild(criarEstrela(tool, estado));
    return wrap;
  }

  function criarSecao(id, titulo, ferramentas, estado) {
    const sec = document.createElement('section');
    sec.className = 'home-secao';
    const h = document.createElement('h2');
    h.className = 'secao-titulo';
    h.id = 'secao-' + id;
    h.textContent = titulo;
    sec.setAttribute('aria-labelledby', h.id);
    const grid = document.createElement('div');
    grid.className = 'tools-grid';
    ferramentas.forEach(tool => grid.appendChild(criarCard(tool, estado)));
    sec.append(h, grid);
    return sec;
  }

  function render() {
    const termo = busca.value.trim();
    const estado = armOk ? lerEstado(arm) : { favoritos: [], recentes: [] };
    const achadas = filtrar(tools, grupos, termo);

    lista.textContent = '';
    if (armOk) {
      const favoritos = ordenarPorIds(achadas, estado.favoritos);
      if (favoritos.length) lista.appendChild(criarSecao('favoritos', 'Favoritos', favoritos, estado));
      const recentes = ordenarPorIds(achadas, estado.recentes.map(r => r.id).slice(0, RECENTES_MAX));
      if (recentes.length) lista.appendChild(criarSecao('recentes', 'Usados recentemente', recentes, estado));
    }
    agrupar(achadas, grupos).forEach(g => lista.appendChild(criarSecao(g.id, g.titulo, g.ferramentas, estado)));

    limpar.hidden = !termo;
    status.hidden = !termo;
    if (termo) {
      status.textContent = achadas.length
        ? achadas.length + ' de ' + tools.length + ' ferramenta(s) encontrada(s)'
        : 'Nenhuma ferramenta encontrada para “' + termo + '”.';
    }
  }

  busca.addEventListener('input', render);
  busca.addEventListener('keydown', e => {
    if (e.key === 'Escape' && busca.value) {
      e.preventDefault();
      busca.value = '';
      render();
    }
  });
  limpar.addEventListener('click', () => {
    busca.value = '';
    render();
    busca.focus();
  });

  // Tecla "/" foca a busca, exceto quando a pessoa já está digitando em outro campo.
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target;
    if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
    e.preventDefault();
    busca.focus();
  });

  // Ao voltar pelo histórico, a página pode vir do cache com os recentes antigos.
  window.addEventListener('pageshow', render);

  render();
})();
