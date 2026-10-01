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
    }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TOOLS;
  } else {
    root.TOOLS = TOOLS;
  }
})(typeof window !== 'undefined' ? window : this);
