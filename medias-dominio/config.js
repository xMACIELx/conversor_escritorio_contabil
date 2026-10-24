(function (root) {
  'use strict';

  // ---- Configuração da ferramenta Médias → Domínio ----
  // Tudo aqui aparece na tela para a contabilidade conferir antes de gerar o arquivo.

  // Colunas da planilha de apuração -> rubrica da Domínio.
  // tipo: 'horas' (valor em H,MM, ex.: 74:31 vira 7431) ou 'valor' (R$ em centavos, ex.: R$ 400,00 vira 40000).
  // rubrica: código da Domínio. null = código ainda não informado: a coluna não gera linha e o relatório bloqueia
  // o arquivo se houver valor nela (nunca sai placeholder).
  // alternativas: outros cabeçalhos aceitos para a mesma coluna (a planilha de férias usa "R$" em vez de "(R$)").
  // A comparação ignora acento e maiúsculas.
  // Padrões da Keli (Gota Limpa, empresa 316): são os códigos de fábrica da tela. DSR HE e DSR outros têm o mesmo
  // código (250): quando as duas colunas têm valor para o mesmo empregado e competência, o core soma em uma linha só.
  const COLUNAS = [
    { cabecalho: 'HE 50% (h:mm)', descricao: 'HE 50%', tipo: 'horas', rubrica: '150' },
    { cabecalho: 'HE 65% (h:mm)', descricao: 'HE 65%', tipo: 'horas', rubrica: '240' },
    { cabecalho: 'HE 100% (h:mm)', descricao: 'HE 100%', tipo: 'horas', rubrica: '200' },
    { cabecalho: 'Adic. noturno (h:mm)', descricao: 'Adicional noturno', tipo: 'horas', rubrica: '25' },
    { cabecalho: 'Comissões (R$)', alternativas: ['Comissões R$'], descricao: 'Comissões', tipo: 'valor', rubrica: '37' },
    { cabecalho: 'Prêmio (R$)', alternativas: ['Prêmio R$'], descricao: 'Prêmio', tipo: 'valor', rubrica: '243' },
    { cabecalho: 'Assiduidade (R$)', alternativas: ['Assiduidade R$'], descricao: 'Assiduidade', tipo: 'valor', rubrica: '236' },
    { cabecalho: 'DSR HE (R$)', alternativas: ['DSR horas extras R$'], descricao: 'DSR sobre HE', tipo: 'valor', rubrica: '250' },
    { cabecalho: 'DSR noturno (R$)', alternativas: ['DSR adicional noturno R$'], descricao: 'DSR noturno', tipo: 'valor', rubrica: '854' },
    { cabecalho: 'DSR outros (R$)', alternativas: ['DSR outros R$'], descricao: 'DSR outros', tipo: 'valor', rubrica: '250' },
    { cabecalho: 'DSR comissões (R$)', alternativas: ['DSR comissões R$'], descricao: 'DSR comissões', tipo: 'valor', rubrica: '853' }
  ];

  // Empresa de fábrica na Domínio (Gota Limpa). Continua editável na tela.
  const EMPRESA_PADRAO = '316';

  // Formato da data do lançamento: dia fixo + mês e ano da competência (padrão 01/MM/AAAA).
  // A confirmar com o arquivo modelo da Domínio (ver decisões).
  const FORMATO_DATA = { dia: '01', separador: '/' };

  // Formato do valor no TXT, num único lugar. Hoje: centavos inteiros sem vírgula (40000 = R$ 400,00; 7431 = 74:31).
  // A Keli ainda vai confirmar com um teste de 1 linha no Domínio; se for decimal, troque só esta função.
  const FORMATAR_VALOR_TXT = valor => String(valor);

  const cfg = {
    COLUNAS,
    EMPRESA_PADRAO,
    FORMATO_DATA,
    FORMATAR_VALOR_TXT,
    SEPARADOR_TXT: ';',
    FIM_DE_LINHA: '\r\n',
    // cabeçalhos da planilha (lidos pelo nome, não pela posição da coluna)
    // Matrícula é opcional (a planilha de férias não tem). Aba: a primeira que tiver um destes nomes; senão, a primeira aba.
    CABECALHO_PLANILHA: { matricula: 'Matrícula', empregado: 'Empregado', competencia: 'Competência MM/AAAA', competenciaAlternativas: ['Competência', 'Competência (MM/AAAA)'] },
    ABAS_ACEITAS: ['Lançamentos por competência', 'Por competência'],
    // cabeçalho da Relação de Empregados (PDF da Domínio). codigoNome: "Código Nome" num texto só (como o pdf.js entrega)
    CABECALHO_RELACAO: { codigo: 'Código', nome: 'Nome', cargo: 'Cargo', codigoNome: 'Código Nome' },
    // leitura do PDF por posição (pontos PDF)
    TOLERANCIA_Y_PT: 3,       // itens com y até 3 pt de diferença formam a mesma linha
    TOLERANCIA_X_PT: 5,       // folga horizontal para a coluna do nome e do código
    ESPACO_ENTRE_ITENS_PT: 1.5 // gap maior que isso entre dois pedaços de texto vira espaço
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = cfg; else root.MediasConfig = cfg;
})(typeof window !== 'undefined' ? window : this);
