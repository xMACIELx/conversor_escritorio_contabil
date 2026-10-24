(function (root) {
  'use strict';

  // ---- Configuração da ferramenta Médias → Domínio ----
  // Tudo aqui aparece na tela para a contabilidade conferir antes de gerar o arquivo.

  // Colunas da planilha de apuração -> rubrica da Domínio.
  // tipo: 'horas' (valor em H,MM, ex.: 74:31 vira 7431) ou 'valor' (R$ em centavos, ex.: R$ 400,00 vira 40000).
  // rubrica: código da Domínio. null = código ainda não informado: a coluna não gera linha e o relatório bloqueia
  // o arquivo se houver valor nela (nunca sai placeholder).
  // Confirmados na tela da Domínio: 150 (HE 50%), 236 (Prêmio assiduidade, na coluna Assiduidade), 250 (Reflexo HE no rep. semanal).
  // Pedro confirmou o mapeamento: 150 = HE 50%, 236 = Assiduidade, 250 = DSR HE; Prêmio (R$) sem código.
  const COLUNAS = [
    { cabecalho: 'HE 50% (h:mm)', descricao: 'HE 50%', tipo: 'horas', rubrica: '150' },
    { cabecalho: 'HE 65% (h:mm)', descricao: 'HE 65%', tipo: 'horas', rubrica: null },
    { cabecalho: 'HE 100% (h:mm)', descricao: 'HE 100%', tipo: 'horas', rubrica: null },
    { cabecalho: 'Adic. noturno (h:mm)', descricao: 'Adicional noturno', tipo: 'horas', rubrica: null },
    { cabecalho: 'Comissões (R$)', descricao: 'Comissões', tipo: 'valor', rubrica: null },
    { cabecalho: 'Prêmio (R$)', descricao: 'Prêmio', tipo: 'valor', rubrica: null },
    { cabecalho: 'Assiduidade (R$)', descricao: 'Assiduidade', tipo: 'valor', rubrica: '236' },
    { cabecalho: 'DSR HE (R$)', descricao: 'DSR sobre HE', tipo: 'valor', rubrica: '250' },
    { cabecalho: 'DSR noturno (R$)', descricao: 'DSR noturno', tipo: 'valor', rubrica: null },
    { cabecalho: 'DSR outros (R$)', descricao: 'DSR outros', tipo: 'valor', rubrica: null }
  ];

  // Formato da data do lançamento: dia fixo + mês e ano da competência (padrão 01/MM/AAAA).
  // A confirmar com o arquivo modelo da Domínio (ver decisões).
  const FORMATO_DATA = { dia: '01', separador: '/' };

  const cfg = {
    COLUNAS,
    FORMATO_DATA,
    SEPARADOR_TXT: ';',
    FIM_DE_LINHA: '\r\n',
    // cabeçalhos da planilha (lidos pelo nome, não pela posição da coluna)
    CABECALHO_PLANILHA: { matricula: 'Matrícula', empregado: 'Empregado', competencia: 'Competência MM/AAAA', competenciaAlternativas: ['Competência'] },
    // cabeçalho da Relação de Empregados (PDF da Domínio). codigoNome: "Código Nome" num texto só (como o pdf.js entrega)
    CABECALHO_RELACAO: { codigo: 'Código', nome: 'Nome', cargo: 'Cargo', codigoNome: 'Código Nome' },
    // leitura do PDF por posição (pontos PDF)
    TOLERANCIA_Y_PT: 3,       // itens com y até 3 pt de diferença formam a mesma linha
    TOLERANCIA_X_PT: 5,       // folga horizontal para a coluna do nome e do código
    ESPACO_ENTRE_ITENS_PT: 1.5 // gap maior que isso entre dois pedaços de texto vira espaço
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = cfg; else root.MediasConfig = cfg;
})(typeof window !== 'undefined' ? window : this);
