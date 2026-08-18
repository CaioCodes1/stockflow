# stockflow

API REST + painel web de controle de estoque para pequenas empresas (12/08/2026).

> **A ideia central:** estoque não é um campo que se edita — é o resultado
> acumulado de entradas e saídas. Nenhum endpoint permite escrever
> `stockQuantity` diretamente; o saldo só muda registrando uma movimentação.

## Stack

Node 20+ (ESM) · Express 4 · PostgreSQL 16 · Prisma 6 · JWT · bcryptjs · Zod ·
helmet · rate-limit · Docker Compose · `node --test` + Supertest

## Estrutura

```
src/
  server.js  →  app.js
  config/       env.js, prisma.js
  constants/    ROLES, MOVEMENT_TYPES, PAGINATION, whitelists de ordenação
  routes/  →  controllers/  →  services/     (sem camada de repository: o
                                              Prisma já é o acesso a dados)
  middlewares/  auth, error, validate, requestLogger
  validators/   Zod                     errors/  AppError
  utils/        asyncHandler, httpResponse, jwt, logger, pagination, password,
                serialize (Decimal do Prisma → número no JSON)
prisma/       schema.prisma, seed.js, sql/, constraints.js
public/       painel: index / dashboard / products / movements (HTML/CSS/JS puro)
tests/        auth, product, movement (integração) + unit/ + smoke.mjs
docker/       init-test-db.sql — cria o banco de teste na 1ª subida do volume
```

## Domínio

- **Papéis**: `ADMIN`, `EMPLOYEE`.
- **Movimentações**: `ENTRY` e `EXIT`. Imutáveis — não há update nem delete.
- **Modelos**: `User`, `Category`, `Product`, `StockMovement`. Todas as FKs com
  `onDelete: Restrict` — não se apaga produto que tem histórico.
- `Product.price` é `Decimal(10,2)`; o JSON serializa via `utils/serialize.js`.
- Paginação com teto de 100 e ordenação por whitelist de colunas.

## O trecho que não pode ser quebrado — transação e concorrência

Registrar uma saída são **duas escritas**: `INSERT` na movimentação + `UPDATE` do
saldo. Elas vivem dentro de `prisma.$transaction(async (tx) => …)` em
`src/services/movement.service.js`.

Dois cuidados que já estão implementados e devem continuar:

1. Dentro do callback usa-se **`tx`, nunca `prisma`** — uma chamada com `prisma`
   ali dentro sai por fora da transação e não sofre rollback.
2. A checagem de saldo **não** é ler-comparar-gravar (isso perde corrida com duas
   requisições simultâneas). Usa-se `updateMany` com `where` incluindo a condição
   de saldo suficiente: o banco decide, e se afetou 0 linhas a operação falhou.
   Alternativas descartadas (e por quê) estão comentadas no próprio arquivo:
   `SELECT … FOR UPDATE` e `isolationLevel: 'Serializable'`.

As constraints `CHECK` ficam em `prisma/sql/constraints.sql` e são aplicadas por
`prisma/constraints.js` — fora do `schema.prisma` porque o Prisma não expressa
`CHECK` de forma declarativa; sendo aditivas, não entram no diff das migrations.

## Comandos

```bash
npm run docker:up
npm run db:migrate
npm run db:constraints   # aplica os CHECKs — rodar depois de migrate
npm run db:seed
npm run dev              # nodemon
npm test                 # node --test em tests/**
npm run test:smoke
```

Painel: config `stockflow-frontend` no `launch.json` da raiz (porta 5520).

## Estado

Commits:

```
0ae5461 2026-08-18  refactor: aplica constraints via script Node em vez de psql no container
ce543f4 2026-08-12  feat: StockFlow - API de controle de estoque
```

O refactor de 18/08 é uma coisa só, em três arquivos: `prisma/constraints.js`
(novo), o script `db:constraints` do `package.json` e a remoção do mount
`./prisma/sql:/sql:ro` do `docker-compose.yml`, que só existia para o `psql` de
dentro do container enxergar o `.sql`. O `constraints.sql` continua sendo a
fonte da verdade — mudou apenas quem o executa.

Somam-se a esses o commit do próprio `CLAUDE.md` (`4fc5155`). **Nada disso foi
enviado**: o local está `ahead 2` de `origin/main`
(`github.com/CaioCodes1/stockflow`) — o `push` falha porque a formatação apagou
as credenciais do GitHub.
