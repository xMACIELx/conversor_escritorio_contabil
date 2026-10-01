(function (root) {
  'use strict';

  const TOOLS = [
    {
      id: 'dominio-totvs',
      nome: 'Domínio → TOTVS',
      descricao: 'Converte o arquivo de lançamentos contábeis exportado pela Domínio para o layout aceito pela TOTVS.',
      de: 'Domínio (.txt)',
      para: 'TOTVS (.txt)',
      caminho: 'dominio-totvs/',
      status: 'pronto'
    },
    {
      id: 'ponto-dominio',
      nome: 'Ponto → Folha Domínio',
      descricao: 'Lê o relatório do ponto (PDF) e a planilha padrão da Domínio e entrega a planilha preenchida e o .txt de importação.',
      de: 'Ponto (PDF) + planilha (.xls)',
      para: 'Planilha (.xls) + Domínio (.txt)',
      caminho: 'ponto-dominio/',
      status: 'pronto'
    }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TOOLS;
  } else {
    root.TOOLS = TOOLS;
  }
})(typeof window !== 'undefined' ? window : this);
