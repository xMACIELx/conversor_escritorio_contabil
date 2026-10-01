# Conversor Domínio → TOTVS

Página estática (HTML + JS puro) que converte o arquivo de lançamentos contábeis exportado pela Domínio para o layout aceito pela TOTVS.

**Todo o processamento acontece no navegador.** O arquivo contém folha de pagamento e nunca é enviado a servidor algum: o `nginx.conf` envia `Content-Security-Policy` com `connect-src 'none'`, que bloqueia qualquer envio de dados pela página.

## O que a conversão faz

Por linha, de forma independente:

| Regra | Antes | Depois |
|---|---|---|
| Posições 19-20 | `AA` | `db` (linha ímpar) / `cr` (linha par) |
| Valor (últimos 8 dígitos) | `00099385` | `000993,85` |
| Acentos no histórico (opcional, marcado por padrão) | `MÊS`, `FÉRIAS` | `MES`, `FERIAS` |
| `CCUSTO00001` (opcional, marcado por padrão) | `CCUSTO00001` | `CCUSTO01100` |

Todo o resto fica igual (sequência, data, conta, histórico, espaços, ordem, tipo de quebra de linha).

Decisões que podem ser ajustadas no topo de `converter.js`:

- `FIRST_LINE_TYPE = 'db'`: se a contadora inverter a regra, troque para `'cr'`.
- `CCUSTO_MAP`: a Domínio gera `CCUSTO00001` em algumas linhas e a TOTVS aceitou `CCUSTO01100` no arquivo de teste (`GOTA TESTE.TXT`). Isso foi deduzido de um único par de linhas; confirmar com a contadora se vale para todas as 12 linhas com `00001`.
- `º` e `°` (ex.: `13º SALÁRIO`) viram **espaço**, e não são apagados, para a linha manter o mesmo tamanho.

## Rodar os testes

Requer Node.js. Os testes usam a pasta `samples/` (que **não** vai para o GitHub, pois tem dados de folha); copie os arquivos de exemplo para ela antes.

```
node test/test.js
```

## Rodar localmente

Abra `index.html` no navegador (não precisa de servidor).

## Deploy no Coolify (VPS Hostinger)

1. Suba este repositório para o GitHub (a pasta `samples/` já está no `.gitignore`).
2. No Coolify: **Projects → (projeto) → + New Resource → Public/Private Repository** (use *Private Repository (with GitHub App)* ou deploy key se o repositório for privado).
3. Escolha o repositório e o branch (`main`).
4. **Build Pack:** `Dockerfile`.
5. **Ports Exposes:** `80`.
6. **Domains:** informe o domínio/subdomínio, por exemplo `https://conversor.seudominio.com.br`. O Coolify emite o certificado HTTPS (Let's Encrypt) automaticamente.
7. Aponte o DNS: registro `A` do subdomínio para o IP da VPS (antes do deploy, para o certificado ser emitido).
8. **Deploy**. Sem senha, por decisão do projeto (a página não guarda nada).

Depois do deploy, confira os cabeçalhos:

```
curl -sI https://conversor.seudominio.com.br | grep -iE "content-security|x-robots|x-content-type"
```
