(function (root) {
  'use strict';

  // ---- Configuração da ferramenta Conferência de NCM e CST ----
  // Só dados. A regra fiscal é do escritório: os agentes não decidem o que entra aqui.

  // Regra base × CST de ICMS validada pela fiscal da MAC. Quando for false, a conferência de base não
  // é considerada ativa e o resultado traz regraBasePendente = true (a interface mostra o aviso amarelo).
  const REGRA_BASE_VALIDADA = true;

  // Tabela CST -> o que se espera da base de cálculo. A chave são os 2 últimos dígitos do CST
  // (no ICMS, o CST tem origem + 2 dígitos; a origem não entra na regra).
  //   'sem_base'           : base deve ser 0
  //   'exige_base'         : base deve ser maior que 0
  //   'exige_base_analise' : como 'exige_base', mas base 0 pode ser legítima; vai para análise caso a caso
  // CST fora da tabela não é conferido.
  const BASE_POR_CST_ICMS = {
    '00': 'exige_base', '20': 'exige_base', '51': 'exige_base_analise', '90': 'exige_base_analise',
    '10': 'sem_base', '30': 'sem_base', '40': 'sem_base', '41': 'sem_base',
    '50': 'sem_base', '60': 'sem_base', '70': 'sem_base'
  };
  // PIS/COFINS, validado pela fiscal da MAC: CSTs que NÃO devem ter base (base zero), conforme a operação
  // (IND_OPER do C100: 0 = entrada, 1 = saída). Vale para CST_PIS (VL_BC_PIS) e CST_COFINS (VL_BC_COFINS).
  // Validados: 04, 05, 06 (saída) e 73, 75 (entrada). Os demais CSTs continuam sem conferência.
  // Sem C100 (operação desconhecida), a regra não é aplicada.
  const BASE_POR_CST_PIS_COFINS = {
    entrada: ['73', '75'],
    saida: ['04', '05', '06']
  };

  // PIS/COFINS, validado pela fiscal da MAC: CSTs que DEVEM ter base maior que 0, conforme a operação
  // (IND_OPER do C100: 0 = entrada, 1 = saída). Vale para CST_PIS (VL_BC_PIS) e CST_COFINS (VL_BC_COFINS).
  // Sem C100 (operação desconhecida), a regra não é aplicada.
  const PIS_COFINS_EXIGE_BASE = {
    entrada: ['50', '51', '52', '53', '56', '98'],
    saida: ['01', '02', '03', '49']
  };

  // Formato dos códigos (só formato; não confere se o código existe nas tabelas oficiais).
  const FORMATO_NCM = /^\d{8}$/;
  // ICMS: origem (0 a 8) + 2 dígitos da tributação.
  const FORMATO_CST_ICMS = /^[0-8]\d{2}$/;
  // PIS/COFINS: 01 a 99.
  const FORMATO_CST_PIS_COFINS = /^(0[1-9]|[1-9]\d)$/;

  const api = {
    REGRA_BASE_VALIDADA, BASE_POR_CST_ICMS, BASE_POR_CST_PIS_COFINS, PIS_COFINS_EXIGE_BASE,
    FORMATO_NCM, FORMATO_CST_ICMS, FORMATO_CST_PIS_COFINS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ConferenciaConfig = api;
})(typeof window !== 'undefined' ? window : this);
