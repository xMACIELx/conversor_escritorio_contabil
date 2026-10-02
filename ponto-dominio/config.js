(function (root) {
  'use strict';

  // ---- Configuração da ferramenta Ponto -> Folha Domínio ----
  // Tudo aqui é exibido na tela (passo 3) para a contadora conferir.

  // Divisores para converter horas em dias, em CENTÉSIMOS DE HORA (inteiros).
  // FALTAS: CONFIRMADO pela contadora. 1 dia = 8,80 h (8:48; jornada de 44 h semanais, seg a sex).
  // DSR:    CONFIRMADO pela contadora. 1 dia = 7,33 h (220 h / 30).
  const DIVISOR_FALTAS_CENT = 880;
  const DIVISOR_DSR_CENT = 733;

  // Um valor "fecha dia inteiro" se estiver a até 0,04 dia de um número inteiro.
  // Em centésimos de dia: 4.
  const TOLERANCIA_DIA_CENT = 4;

  // Mapeamento: evento do relatório do ponto -> evento da Domínio.
  // unidade: 'horas' (rubrica em Horas da Domínio: horas decimais -> minutos -> valor H,MM, ex.: 2,40 h = 144 min = 2,24)
  //          ou 'dias' (horas / divisor).
  // O relatório pode vir em dois layouts de código (agosto e setembro); os dois são aceitos.
  const GRUPOS_EVENTOS = {
    ponto: 'Códigos do sistema de ponto (ex.: relatório de agosto)',
    dominio: 'Códigos da própria Domínio, 5 dígitos (ex.: relatório de setembro)'
  };
  const EVENTOS = [
    { grupo: 'ponto', origem: '68001', nome: 'Horas Noturnas',          evento: '0025', unidade: 'horas' },
    { grupo: 'ponto', origem: '69050', nome: 'Base Extra 50%',          evento: '0150', unidade: 'horas' },
    { grupo: 'ponto', origem: '69065', nome: 'Base Extras 65%',         evento: '0240', unidade: 'horas' },
    { grupo: 'ponto', origem: '50101', nome: 'Faltas/Atrasos',          evento: '0235', unidade: 'horas' },
    { grupo: 'ponto', origem: '50001', nome: 'Faltas não Justificadas', evento: '0260', unidade: 'dias', divisor: 'FALTAS' },
    { grupo: 'ponto', origem: '50201', nome: 'Repousos Desc. (DSR)',    evento: '8794', unidade: 'dias', divisor: 'DSR' },

    { grupo: 'dominio', origem: '00025', nome: 'Adicional Notur',   evento: '0025', unidade: 'horas' },
    { grupo: 'dominio', origem: '00150', nome: 'HE 50%',            evento: '0150', unidade: 'horas' },
    { grupo: 'dominio', origem: '00200', nome: 'HE 100%',           evento: '0200', unidade: 'horas' },
    { grupo: 'dominio', origem: '00235', nome: 'Outras Faltas',     evento: '0235', unidade: 'horas' },
    { grupo: 'dominio', origem: '00240', nome: 'HE 65%',            evento: '0240', unidade: 'horas' },
    { grupo: 'dominio', origem: '00260', nome: 'Faltas Injustif',   evento: '0260', unidade: 'dias', divisor: 'FALTAS' },
    { grupo: 'dominio', origem: '08794', nome: 'DSR Perdido',       evento: '8794', unidade: 'dias', divisor: 'DSR' }
  ];

  // Nome da coluna criada na planilha quando o evento não existe nela (linha 9).
  const NOMES_COLUNA_NOVA = { '0240': 'Hora extra 65%', '0200': 'Hora extra 100%' };
  // Folha do relatório -> tipo de cálculo da Domínio (coluna A da planilha).
  const TIPOS_CALCULO = [
    { re: /^MENSAL$/, tipo: 11 },
    { re: /^ADIANTAMENTO/, tipo: 41 },
    { re: /^COMPLEMENTAR/, tipo: 42 },
    { re: /^13.*ADIANT/, tipo: 51 },
    { re: /^13/, tipo: 52 }
  ];
  // Só estas linhas da planilha são lidas (regra do .jar)
  const TIPOS_LIDOS = [11, 41, 42, 51, 52];

  const cfg = {
    DIVISOR_FALTAS_CENT, DIVISOR_DSR_CENT, TOLERANCIA_DIA_CENT,
    EVENTOS, GRUPOS_EVENTOS, NOMES_COLUNA_NOVA, TIPOS_CALCULO, TIPOS_LIDOS,
    // regras do layout (.jar)
    PRIMEIRA_COLUNA_EVENTOS: 3,   // D
    MAX_COLUNAS_EVENTOS: 60,
    LINHA_CODIGOS: 10,
    LINHA_NOMES: 9,
    PRIMEIRA_LINHA_DADOS: 11,
    FORMATO_VALOR: '#,##0.00'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = cfg; else root.PontoConfig = cfg;
})(typeof window !== 'undefined' ? window : this);
