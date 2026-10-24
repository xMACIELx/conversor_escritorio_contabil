(function (root) {
  'use strict';

  // Ordem e títulos dos grupos da home. Grupo novo entra aqui e em TOOLS, sem mexer em home.js.
  const GRUPOS = [
    { id: 'folha', titulo: 'Folha' },
    { id: 'contabil', titulo: 'Contábil' },
    { id: 'fiscal', titulo: 'Fiscal' }
  ];

  // grupo: id de GRUPOS. palavras: termos extras para a busca (sinônimos e termos de arquivo).
  const TOOLS = [
    {
      id: 'dominio-totvs',
      nome: 'Domínio → TOTVS',
      descricao: 'Converte o arquivo de lançamentos contábeis exportado pela Domínio para o layout aceito pela TOTVS.',
      de: 'Domínio (.txt)',
      para: 'TOTVS (.txt)',
      caminho: 'dominio-totvs/',
      status: 'pronto',
      grupo: 'contabil',
      palavras: ['lançamentos', 'contabilidade', 'razão', 'importação']
    },
    {
      id: 'ponto-dominio',
      nome: 'Ponto → Folha Domínio',
      descricao: 'Lê o relatório do ponto (PDF) e a planilha padrão da Domínio e entrega a planilha preenchida e o .txt de importação.',
      de: 'Ponto (PDF) + planilha (.xls)',
      para: 'Planilha (.xls) + Domínio (.txt)',
      caminho: 'ponto-dominio/',
      status: 'pronto',
      grupo: 'folha',
      palavras: ['ponto', 'horas', 'faltas', 'dsr', 'relatório do ponto']
    },
    {
      id: 'conferencia-ncm-cst',
      nome: 'Conferência de NCM e CST',
      descricao: 'Lê o SPED Fiscal e lista as inconsistências de NCM (registro 0200) e de CST e base de cálculo (registro C170).',
      de: 'SPED Fiscal (.txt)',
      para: 'Lista de inconsistências',
      caminho: 'conferencia-ncm-cst/',
      status: 'pronto',
      grupo: 'fiscal',
      palavras: ['sped', 'cst', 'c170', '0200', 'nota fiscal', 'base de cálculo', 'icms', 'pis', 'cofins']
    },
    {
      id: 'medias-dominio',
      nome: 'Médias → Domínio',
      descricao: 'Lê a planilha de apuração das médias e a Relação de Empregados (PDF) da Domínio e gera o .txt de lançamento de médias por rubrica.',
      de: 'Planilha (.xlsx) + Relação (PDF)',
      para: 'Domínio (.txt)',
      caminho: 'medias-dominio/',
      status: 'pronto',
      grupo: 'folha',
      palavras: ['médias', '13º', 'férias', 'rubrica', 'relação de empregados', 'comissões']
    }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TOOLS;
    TOOLS.GRUPOS = GRUPOS;
  } else {
    root.TOOLS = TOOLS;
    root.GRUPOS = GRUPOS;
  }
})(typeof window !== 'undefined' ? window : this);
