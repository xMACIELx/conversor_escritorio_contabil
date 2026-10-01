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
├── test/
│   └── test.js             # Testes unitários, de integridade e com amostras
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

| Regra | Antes | Depois |
|---|---|---|
| Posições 19-20 | `AA` | `db` (linha ímpar) / `cr` (linha par) |
| Valor (últimos 8 dígitos) | `00099385` | `000993,85` |
| Acentos no histórico (opcional) | `MÊS`, `FÉRIAS` | `MES`, `FERIAS` |
| `CCUSTO00001` (opcional) | `CCUSTO00001` | `CCUSTO01100` |

Configurações ajustáveis no topo de `dominio-totvs/converter.js`:
- `FIRST_LINE_TYPE = 'db'`: se a contadora inverter a regra, altere para `'cr'`.
- `CCUSTO_MAP`: mapeamento de centro de custo (ex.: `CCUSTO00001` → `CCUSTO01100`).
- `º` e `°` (ex.: `13º SALÁRIO`) viram **espaço** para manter o alinhamento de colunas fixas.

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
