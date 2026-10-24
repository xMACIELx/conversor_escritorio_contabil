'use strict';
// Home (index.html): busca, agrupamento, favoritos e recentes. Chamado por test/regras.js.
// Usa só dados SINTÉTICOS: a lista de 20 ferramentas é gerada aqui e nenhum arquivo de cliente é lido.
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOOLS = require(path.join(ROOT, 'assets', 'tools.js'));
const GRUPOS = TOOLS.GRUPOS;
const H = require(path.join(ROOT, 'assets', 'home.js'));

// Armazenamento falso que guarda em memória (mesma forma do localStorage).
function armazenamentoFalso() {
  const dados = new Map();
  return {
    getItem: k => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: k => dados.delete(k)
  };
}

// Armazenamento que existe mas recusa gravar (cota cheia ou bloqueio do navegador).
const armazenamentoBloqueado = {
  getItem() { throw new Error('bloqueado'); },
  setItem() { throw new Error('bloqueado'); },
  removeItem() { throw new Error('bloqueado'); }
};

// 20 ferramentas sintéticas: 3 grupos, 2 ainda "Em breve" e 1 com grupo desconhecido.
const GRUPOS_SINTETICOS = ['folha', 'contabil', 'fiscal'];
const SINTETICAS = Array.from({ length: 20 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return {
    id: 'sint-' + n,
    nome: 'Ferramenta ' + n,
    descricao: 'Descrição sintética ' + n + '.',
    de: 'Origem ' + n,
    para: 'Destino ' + n,
    caminho: 'sint-' + n + '/',
    status: (i === 5 || i === 11) ? 'em breve' : 'pronto',
    grupo: i === 19 ? 'grupo-sem-titulo' : GRUPOS_SINTETICOS[i % 3],
    palavras: i === 7 ? ['termo raro zebra'] : []
  };
});

const ids = lista => lista.map(t => t.id);
const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b);

module.exports = async function run(check) {
  console.log('\nHome: busca, grupos, favoritos e recentes');

  // Normalização
  check('busca ignora maiúsculas e acento', H.normalizar('  MÉDIAS  ') === 'medias');
  check('busca ignora acento de palavras com cedilha e til', H.normalizar('Relação Ç ã') === 'relacao c a');

  // Registro real (assets/tools.js)
  check('tools.js: todo grupo de ferramenta existe em GRUPOS',
    TOOLS.every(t => GRUPOS.some(g => g.id === t.grupo)));
  check('tools.js: GRUPOS na ordem Folha, Contábil, Fiscal',
    iguais(GRUPOS.map(g => g.titulo), ['Folha', 'Contábil', 'Fiscal']));
  check('tools.js: atribuição inicial dos grupos',
    iguais(TOOLS.map(t => t.id + '=' + t.grupo),
      ['dominio-totvs=contabil', 'ponto-dominio=folha', 'conferencia-ncm-cst=fiscal', 'medias-dominio=folha']));

  // Busca nas 4 ferramentas reais
  check('busca "ncm" acha só a Conferência de NCM e CST',
    iguais(ids(H.filtrar(TOOLS, GRUPOS, 'ncm')), ['conferencia-ncm-cst']));
  check('busca "NCM" (maiúscula) acha a mesma ferramenta',
    iguais(ids(H.filtrar(TOOLS, GRUPOS, 'NCM')), ['conferencia-ncm-cst']));
  check('busca "medias" (sem acento) acha Médias → Domínio',
    iguais(ids(H.filtrar(TOOLS, GRUPOS, 'medias')), ['medias-dominio']));
  check('busca por título de grupo "fiscal" acha o grupo Fiscal',
    iguais(ids(H.filtrar(TOOLS, GRUPOS, 'fiscal')), ['conferencia-ncm-cst']));
  check('busca com duas palavras exige as duas ("ponto folha")',
    iguais(ids(H.filtrar(TOOLS, GRUPOS, 'ponto folha')), ['ponto-dominio']));
  check('busca sem termo devolve todas, sem mudar a lista original',
    H.filtrar(TOOLS, GRUPOS, '   ').length === TOOLS.length);
  check('busca sem resultado devolve lista vazia', H.filtrar(TOOLS, GRUPOS, 'xyzabc').length === 0);

  // Lista sintética de 20
  check('sintética: 20 ferramentas', SINTETICAS.length === 20);
  check('sintética: busca acha palavra extra da ferramenta (palavras)',
    iguais(ids(H.filtrar(SINTETICAS, GRUPOS, 'zebra')), ['sint-08']));
  check('sintética: "em breve" também aparece na busca',
    H.filtrar(SINTETICAS, GRUPOS, 'Ferramenta 06').length === 1 && H.filtrar(SINTETICAS, GRUPOS, 'Ferramenta 06')[0].status === 'em breve');
  check('sintética: busca "Ferramenta" acha as 20', H.filtrar(SINTETICAS, GRUPOS, 'ferramenta').length === 20);

  const secoes = H.agrupar(SINTETICAS, GRUPOS);
  check('sintética: agrupar mantém a ordem de GRUPOS e põe grupo desconhecido em "Outras"',
    iguais(secoes.map(s => s.titulo), ['Folha', 'Contábil', 'Fiscal', 'Outras']));
  check('sintética: agrupar cobre as 20 sem repetir',
    secoes.reduce((total, s) => total + s.ferramentas.length, 0) === 20);
  check('sintética: grupo sem resultado some',
    H.agrupar(H.filtrar(SINTETICAS, GRUPOS, 'zebra'), GRUPOS).length === 1);
  check('sintética: agrupar sem nada devolve zero grupos', H.agrupar([], GRUPOS).length === 0);

  // ordenarPorIds
  const ordem = ['sint-03', 'nao-existe', 'sint-01', 'sint-03'];
  check('ordenarPorIds segue a ordem dada, sem repetir e sem id desconhecido',
    iguais(ids(H.ordenarPorIds(SINTETICAS, ordem)), ['sint-03', 'sint-01']));

  // Armazenamento
  check('armazenamento disponível: fake funciona', H.armazenamentoDisponivel(armazenamentoFalso()) === true);
  check('armazenamento indisponível: bloqueado detecta', H.armazenamentoDisponivel(armazenamentoBloqueado) === false);
  check('armazenamento indisponível: nulo detecta', H.armazenamentoDisponivel(null) === false);
  check('lerEstado com armazenamento bloqueado não lança e devolve vazio',
    iguais(H.lerEstado(armazenamentoBloqueado), { favoritos: [], recentes: [] }));
  check('lerEstado com armazenamento nulo não lança e devolve vazio',
    iguais(H.lerEstado(null), { favoritos: [], recentes: [] }));
  check('gravarEstado com armazenamento bloqueado devolve false sem lançar',
    H.gravarEstado(armazenamentoBloqueado, { favoritos: [], recentes: [] }) === false);

  const lixo = armazenamentoFalso();
  lixo.setItem(H.CHAVE, '{não é json');
  check('lerEstado com JSON inválido devolve vazio', iguais(H.lerEstado(lixo), { favoritos: [], recentes: [] }));
  lixo.setItem(H.CHAVE, JSON.stringify({ favoritos: ['ok', 42, null], recentes: [null, { id: 'ok2' }, { id: 7 }] }));
  check('lerEstado descarta tipos errados', iguais(H.lerEstado(lixo), { favoritos: ['ok'], recentes: [{ id: 'ok2' }] }));

  // Favoritos
  const store = armazenamentoFalso();
  let estado = H.lerEstado(store);
  estado = H.alternarFavorito(estado, 'medias-dominio');
  check('estrela adiciona favorito', iguais(estado.favoritos, ['medias-dominio']));
  check('alternarFavorito não muda o estado original', H.lerEstado(store).favoritos.length === 0);
  H.gravarEstado(store, estado);
  check('favorito persiste ao reler (simula recarregar)',
    iguais(H.lerEstado(store).favoritos, ['medias-dominio']));
  estado = H.alternarFavorito(H.lerEstado(store), 'medias-dominio');
  check('estrela de novo remove favorito', estado.favoritos.length === 0);

  // Recentes
  let recentes = H.lerEstado(store);
  ['sint-01', 'sint-02', 'sint-03', 'sint-04', 'sint-05', 'sint-06'].forEach((id, i) => {
    recentes = H.registrarUso(recentes, id, 1000 + i);
  });
  check('recentes guardam no máximo 4', recentes.recentes.length === H.RECENTES_MAX && recentes.recentes.length === 4);
  check('recentes: a última aberta vem primeiro',
    iguais(recentes.recentes.map(r => r.id), ['sint-06', 'sint-05', 'sint-04', 'sint-03']));
  recentes = H.registrarUso(recentes, 'sint-04', 2000);
  check('recentes: reabrir move para o topo sem duplicar',
    iguais(recentes.recentes.map(r => r.id), ['sint-04', 'sint-06', 'sint-05', 'sint-03']));
  check('recentes: guardam a data do uso', recentes.recentes[0].quando === 2000);

  // Abrir a ferramenta e voltar: a lista lida do armazenamento mostra o que foi aberto por último
  H.gravarEstado(store, recentes);
  check('recentes persistem ao reler', H.lerEstado(store).recentes[0].id === 'sint-04');

  check('CHAVE do localStorage é fixa e sem dado de arquivo', H.CHAVE === 'conversores-home');
};
