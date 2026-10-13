(function (root) {
  'use strict';

  // ---- Configuração da ferramenta Conferência de NCM e CST ----
  // Só dados. A regra fiscal é do escritório: os agentes não decidem o que entra aqui.

  // PENDENTE DE VALIDAÇÃO DO PEDRO. Enquanto for false, a conferência "base × CST" não aponta nada
  // (a tabela abaixo está vazia de propósito) e o resultado traz regraBasePendente = true.
  const REGRA_BASE_VALIDADA = false;

  // Tabela CST -> o que se espera da base de cálculo:
  //   'sem_base'  : CST isento / não tributado, base deve ser 0
  //   'exige_base': CST tributado, base deve ser maior que 0
  // CST fora da tabela não é conferido (CSTs ambíguos, como diferimento e redução de base, ficam de fora
  // até o Pedro decidir). Preencher depois da validação, por exemplo: { '040': 'sem_base', '000': 'exige_base' }.
  const BASE_POR_CST_ICMS = {};
  const BASE_POR_CST_PIS_COFINS = {};

  // Formato dos códigos (só formato; não confere se o código existe nas tabelas oficiais).
  const FORMATO_NCM = /^\d{8}$/;
  // ICMS: origem (0 a 8) + 2 dígitos da tributação.
  const FORMATO_CST_ICMS = /^[0-8]\d{2}$/;
  // PIS/COFINS: 01 a 99.
  const FORMATO_CST_PIS_COFINS = /^(0[1-9]|[1-9]\d)$/;

  const api = {
    REGRA_BASE_VALIDADA, BASE_POR_CST_ICMS, BASE_POR_CST_PIS_COFINS,
    FORMATO_NCM, FORMATO_CST_ICMS, FORMATO_CST_PIS_COFINS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ConferenciaConfig = api;
})(typeof window !== 'undefined' ? window : this);
