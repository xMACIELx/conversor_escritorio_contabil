# Painel de Conversores de Folha

Painel de ferramentas estático (HTML/JS puro, sem backend e sem build) para processamento e conversão de arquivos de departamento pessoal e contabilidade.

**Todo o processamento acontece localmente no navegador.** Os arquivos contêm dados confidenciais de folha de pagamento e nunca são enviados a servidor algum: o `nginx.conf` define a política de segurança `Content-Security-Policy` com `connect-src 'none'`, bloqueando qualquer requisição externa.

---

## Estrutura do projeto

```
.
├── index.html              # Home do painel de ferramentas
├── assets/
│   ├── shared.css          # Variáveis de cor, tipografia, cabeçalho, botões e cards
│   ├── tools.js            # Registro central das ferramentas disponíveis
│   └── home.js             # Renderização dinâmica dos cards na home
├── dominio-totvs/          # Conversor Domínio → TOTVS
│   ├── index.html          # Interface do conversor com link para Início
│   ├── app.js              # Manipulação da DOM, drag & drop e download
│   ├── converter.js        # Regras puras de conversão e validações (browser + Node)
│   └── style.css           # Estilos específicos da ferramenta
├── ponto-dominio/          # Ponto → Folha Domínio (ver seção abaixo; vendor/ = pdf.js e SheetJS)
├── test/
│   ├── test.js             # Testes unitários, de integridade e com amostras
│   └── ponto.js            # Testes da ferramenta Ponto → Folha Domínio
├── samples/                # Arquivos reais de teste (ignorado no git)
├── Dockerfile              # Imagem Nginx mínima para produção
├── nginx.conf              # Servidor estático com headers de segurança
└── .dockerignore           # Exclui amostras, testes e documentação da imagem
```

---

## Como adicionar uma nova ferramenta (3 passos)

1. **Crie a pasta da ferramenta:**
   Crie uma pasta na raiz (por exemplo, `senior-totvs/`) com o arquivo `index.html` e seus scripts/estilos específicos. No cabeçalho, importe o estilo compartilhado `<link rel="stylesheet" href="../assets/shared.css">` e adicione o link de retorno `<a href="../" class="back-link">← Início</a>`.

2. **Registre em `assets/tools.js`:**
   Adicione uma nova entrada ao array `TOOLS`:
   ```javascript
   {
     id: 'senior-totvs',
     nome: 'Sênior → TOTVS',
     descricao: 'Converte arquivo de folha da Sênior para o layout aceito pela TOTVS.',
     de: 'Sênior (.txt)',
     para: 'TOTVS (.txt)',
     caminho: 'senior-totvs/',
     status: 'pronto' // ou 'em-breve'
   }
   ```

3. **Atualize o deploy e teste:**
   No `Dockerfile`, adicione a cópia da pasta (`COPY senior-totvs/ /usr/share/nginx/html/senior-totvs/`) e execute os testes para validar se a pasta e o `index.html` estão corretos:
   ```bash
   node test/test.js
   ```

---

## Rodar os testes

Requer Node.js. Os testes validam as funções puras de conversão, a integridade do registro em `assets/tools.js` e a consistência das saídas com os arquivos de amostra em `samples/`:

```bash
node test/test.js
```

---

## Rodar localmente

Abra o arquivo `index.html` da raiz diretamente no navegador (não requer servidor web, Node ou processo de build).

---

## Conversor Domínio → TOTVS

Converte o arquivo de lançamentos contábeis exportado pela Domínio para o layout aceito pela TOTVS.

O conversor aceita **dois layouts** de entrada e detecta qual é pelo campo de tipo (posições 19-20). A tela mostra no resumo `Layout detectado: Domínio atual (CR/DB)` ou `Layout antigo (AA)`.

**Layout principal: Domínio atual (CR/DB)** — o exportado hoje pela Domínio.
- Posições 19-20 já vêm `CR` ou `DB`; o conversor só passa para minúsculas (`cr`/`db`), **sem inverter nem alternar**.
- Valor: as 8 últimas posições trazem os centavos sem zeros à esquerda, alinhados à esquerda e completados com espaços (`18911   ` = 189,11). O conversor tira os espaços, completa com zeros à esquerda até 8 dígitos e insere a vírgula.

**Layout antigo (AA)** — continua funcionando.
- Posições 19-20 vêm `AA`: `db` na linha ímpar e `cr` na par.
- Valor com 8 dígitos (`00099385`).

A saída é igual nos dois layouts:

| Campo | Layout atual (entrada) | Layout antigo (entrada) | Saída |
|---|---|---|---|
| Posições 19-20 | `CR` / `DB` | `AA` | `cr` / `db` |
| Valor (8 últimas posições) | `18911   ` | `00018911` | `000189,11` |
| Valor | `315     ` | `00000315` | `000003,15` |
| Acentos no histórico (opcional) | `MÊS`, `FÉRIAS` | idem | `MES`, `FERIAS` |
| `CCUSTO00001` (opcional) | `CCUSTO00001` | idem | `CCUSTO01100` |

Validações no resumo: número de linhas par; valor numérico nas 8 últimas posições (com ou sem zeros à esquerda); tipo `AA` ou `CR`/`DB` (**misturar os dois layouts no mesmo arquivo é erro**); no layout atual, cada par tem exatamente um `CR` e um `DB`; pares com mesma data, centro de custo e valor; soma `db` = soma `cr`; saída com tamanho da entrada + 1; todos os caracteres cabem em Windows-1252.

Configurações ajustáveis no topo de `dominio-totvs/converter.js`:
- `FIRST_LINE_TYPE = 'db'`: vale só para o layout antigo (AA); se a contadora inverter a regra, altere para `'cr'`.
- `CCUSTO_MAP`: mapeamento de centro de custo (ex.: `CCUSTO00001` → `CCUSTO01100`).
- `º` e `°` (ex.: `13º SALÁRIO`) viram **espaço** para manter o alinhamento de colunas fixas.

---

## Ponto → Folha Domínio

Lê o **relatório do ponto** (PDF, horas em decimal) e a **planilha padrão da Domínio** (.xls) e entrega (a) a planilha preenchida e (b) o `.txt` de importação da Domínio (`LANCAMENTOS_AAAAMM.txt`). Tudo no navegador, com o mesmo CSP do painel (`connect-src 'none'`, sem CDN, sem `unsafe-eval`).

> **Rodar localmente:** esta ferramenta usa um Web Worker (pdf.js), que o navegador não executa a partir de `file://`. Para testar fora do Docker, sirva a pasta por HTTP (ex.: `python -m http.server` na raiz) e abra `/ponto-dominio/`.

```
ponto-dominio/
├── index.html        # Interface em 4 passos
├── app.js            # DOM: uploads, conferência, downloads
├── config.js         # Mapeamento de eventos, divisores e constantes (visível na tela)
├── core.js           # Regras puras: conversões, casamento de nomes, gerador do .txt, validações
├── pdf-parse.js      # Reconstrução das linhas do PDF (posição y, depois x) e leitura do relatório
└── vendor/           # pdf.js 3.11.174 (+ worker) e SheetJS (xlsx) 0.18.5, copiados do npm; sem CDN
```

### Decisões da contadora (01/10/2026)

- **Faltas (0260):** 1 dia = 8,80 h (jornada de 44 h semanais, seg a sex). Faltas abaixo de meio dia (que arredondam para 0 dia) são lançadas **à mão** na Domínio. Meio dia (0,5) não é aceito, porque não calcula certo.
- **DSR (8794):** 1 dia = 7,33 h (220 h / 30). Valores que não fecham (ex.: 6,67 h) entram como o dia mais próximo.
- **Faltas/atrasos (0235) e adicional noturno (0025):** calculados em minutos e lançados como horas e minutos (H,MM; ver "Regras"). *Atualizado em 02/10/2026: a rubrica é em "Horas" na Domínio, então o valor sai como `2,24` (2h24), e não como minutos totais.*
- **Hora extra 65% = rubrica 0240.** Base Extra é o que vai para a folha.
- **Colaboradores sem correspondência:** ficam fora do arquivo, com opção de digitar o código folha.

### Regras

- **Planilha = fonte de verdade** para empresa (C3), competência (C6), tipo de cálculo (coluna A), código folha (B) e nomes (C). O "contrato" do relatório não é o código folha.
- **Dois layouts de código no relatório** (os dois são aceitos e aparecem na tabela de regras da tela): códigos do sistema de ponto (agosto: 68001, 69050, 69065, 50101, 50001, 50201) e códigos da própria Domínio com 5 dígitos (setembro: 00025 Adicional Notur, 00150 HE 50%, 00200 HE 100%, 00235 Outras Faltas, 00240 HE 65%, 00260 Faltas Injustif, 08794 DSR Perdido). Um código que não esteja em nenhum dos dois grupos é mostrado em vermelho (Avise o desenvolvedor com estes códigos).
- **Sem lançamentos:** se nenhum evento virar linha no .txt, o resumo mostra em vermelho Nenhum lançamento gerado e os botões de download ficam desativados.
- **Horas e minutos, formato H,MM** (0025 noturno, 0150 base extra 50%, 0200 hora extra 100%, 0240 base extras 65%, 0235 faltas/atrasos). A rubrica da Domínio é em "Horas": o valor da célula **não** é hora decimal nem minutos totais, e sim `H,MM`, em que **2,24 significa 2h24** (a Domínio mostra 144,00 como 144:00 e 16,00 como 016:00). Cálculo, só com inteiros:
  1. minutos totais = `floor((centésimos × 60 + 50) / 100)`;
  2. `H = floor(minutos / 60)`, `M = minutos % 60`;
  3. valor da célula = `H + M/100`, montado de inteiros (`H × 100 + M` centésimos), com formato `#,##0.00`. O texto exibido é `H,MM`; o `.jar` tira os não-dígitos e completa para 9 posições.

  | Horas do relatório | Minutos | Célula (H,MM) | Valor no `.txt` |
  |---|---|---|---|
  | 0,27 | 16 | 0,16 | `000000016` |
  | 2,40 | 144 | 2,24 | `000000224` |
  | 0,60 | 36 | 0,36 | `000000036` |
  | 1,00 | 60 | 1,00 | `000000100` |
  | 55,73 | 3344 | 55,44 | `000005544` |
  | 70,23 | 4214 | 70,14 | `000007014` |

  Na tabela de conferência da tela, esses eventos mostram o valor da célula e o horário legível (ex.: `2,24 (2:24 h)`).
- **Dias** (0260 faltas não justificadas, 8794 DSR): horas ÷ divisor, arredondado ao inteiro mais próximo. Valores a mais de 0,04 dia de um inteiro entram arredondados, em **amarelo** na conferência, com as horas originais e uma lista copiável no resumo. Valor não zero que arredonda para 0 é avisado (sumiria do arquivo).
- Aritmética sempre inteira (centésimos), sem ponto flutuante.
- **0200 e 0240** existem na planilha de setembro; se faltarem em outra planilha, a ferramenta cria a coluna na primeira posição livre (linha 10 vazia, 999 ou 9999 — no modelo de agosto, a coluna J), com nome na linha 9 e código na linha 10.
- **Eventos do relatório fora da tabela** aparecem como erro em destaque; nada some em silêncio.
- **Casamento de nomes** (maiúsculas, sem acento, espaços colapsados): exato = automático; aproximado (prefixo, 2+ palavras, candidato único) = amarelo, com "confirmar" **desmarcado**; sem correspondência = fica de fora, com campo opcional de código folha (quem tem código entra: a linha é acrescentada à planilha antes dos totais) e lista copiável dos excluídos.
- Competência da planilha diferente do mês do relatório = **aviso** (não bloqueia). O arquivo sai com a competência da planilha.
- Com erros no resumo, o download pede confirmação.

### Divisores (config.js)

| Constante | Valor | Situação |
|---|---|---|
| `DIVISOR_FALTAS_CENT` | 8,80 h (8:48; 44 h semanais, seg a sex) | **Confirmado** pela contadora |
| `DIVISOR_DSR_CENT` | 7,33 h (220 h / 30) | **Confirmado** pela contadora |

Ambos podem ser alterados na própria tela (painel "Regras de conversão em uso") para simular; para mudar o padrão, edite `config.js`.

### Observações sobre o relatório de exemplo

- O PDF traz no fim o bloco **"Total dos VDBs"**; a ferramenta usa esses totais para conferir que leu o PDF inteiro (soma das horas lidas = total impresso).
- Contagem de lançamentos por evento na amostra de agosto: 68001 = 81, 69050 = 149, 69065 = 32, 50101 = 25, 50201 = 22, 50001 = 22 (soma 331 = "Total: 331" do PDF). Uma leitura ingênua do PDF conta também as linhas do bloco de totais (82/150/33/26/23), o que está errado.
- O pdf.js tenta buscar fontes padrão para PDFs com fontes não embutidas; com `connect-src 'none'` essa busca é bloqueada (aviso no console), sem afetar a extração do texto.

### Saídas

- **Planilha preenchida**: `<planilha>_preenchida.xls` (BIFF8, 97-2003, para o `.jar` ler). Valores gravados como número com formato `#,##0.00` (o `.jar` lê o texto exibido). Fórmulas de totais mantidas e recalculadas. A formatação visual do modelo (cores, bordas, comentários) pode não se manter, mas o conteúdo sim.
- **`LANCAMENTOS_AAAAMM.txt`**: mesma regra do `.jar` (ASCII, CRLF), linhas de 43 caracteres: `"10"` + código folha (10) + AAAAMM + evento (4) + tipo de cálculo (2) + valor (9) + empresa (10). Só lê linhas com coluna A = 11, 41, 42, 51 ou 52; valor = dígitos do texto exibido da célula, com zeros à esquerda até 9; zero é ignorado.

### Como conferir manualmente com o `.jar`

1. Gere os dois arquivos na ferramenta (a planilha `_preenchida.xls` e o `LANCAMENTOS_AAAAMM.txt`).
2. Abra `03- ConversorFolha 50 colunas.jar`, converta a planilha `_preenchida.xls` e salve o `.txt` gerado pelo jar (ex.: `jar.txt`).
3. Compare byte a byte no Prompt de Comando:
   ```
   fc /b jar.txt LANCAMENTOS_202609.txt
   ```
   A saída esperada é `FC: nenhuma diferença encontrada`.

Os testes (`node test/test.js`) já fazem o equivalente em memória: gravam o `.xls`, leem de volta e aplicam a regra do `.jar`, exigindo o **mesmo** `.txt` gerado direto. A regra do `.jar` foi implementada a partir da descrição do fluxo (não havia JDK para rodar `javap`), por isso a comparação com `fc` é a verificação final.

---

## Deploy no Coolify (VPS Hostinger)

1. Suba este repositório para o GitHub (`samples/` permanece ignorado).
2. No Coolify: **Projects → (projeto) → + New Resource → Public/Private Repository**.
3. Selecione o repositório e o branch `main`.
4. **Build Pack:** `Dockerfile`.
5. **Ports Exposes:** `80`.
6. **Domains:** informe a URL pública (ex.: `https://conversores.seudominio.com.br`).
7. **Deploy**.

O `nginx.conf` inclui `absolute_redirect off;` para que acessos sem barra final (ex.: `/dominio-totvs`) sejam redirecionados corretamente para `/dominio-totvs/` sob proxy reverso HTTPS sem trocar a porta.
