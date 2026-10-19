'use strict';
// Runner das checagens de regra: test/conferencia.js, test/ponto.js e test/ponto-setembro.js
// exportam run(check) (não usam node:test), então "node --test" não as executa de verdade.
// Sai com 1 se qualquer checagem falhar. Partes que dependem de samples/ (fora do Git) são puladas.
const path = require('path');

const ARQUIVOS = ['conferencia.js', 'ponto.js', 'ponto-setembro.js'];
const AMOSTRA_AUSENTE = /^amostras .* presentes/;

let passes = 0;
const falhas = [];
const puladas = [];

function check(nome, ok, detalhe) {
  if (!ok && AMOSTRA_AUSENTE.test(nome)) {
    puladas.push(nome + (detalhe ? ' (' + detalhe + ')' : ''));
    return;
  }
  if (ok) { passes++; return; }
  falhas.push(nome + (detalhe ? '\n         ' + detalhe : ''));
}

(async () => {
  for (const arq of ARQUIVOS) {
    console.log('\n== ' + arq);
    await require(path.join(__dirname, arq))(check);
  }
  console.log('\nRegras: ' + passes + ' passaram, ' + falhas.length + ' falharam, ' + puladas.length + ' puladas (dependem de samples/)');
  puladas.forEach(p => console.log('  PULADA ' + p));
  falhas.forEach(f => console.log('  FALHA ' + f));
  process.exit(falhas.length ? 1 : 0);
})().catch(err => {
  console.error('Erro ao executar as regras:', err);
  process.exit(1);
});
