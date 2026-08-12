# StockFlow — Controle de Estoque

API REST e painel web para pequenas empresas controlarem produtos e movimentações de estoque.
MVP com poucas funcionalidades, implementadas com o rigor de um sistema real.

> **A ideia central do projeto:** estoque não é um campo que se edita — é o resultado acumulado de
> entradas e saídas. O backend é o único lugar onde essa conta pode acontecer.

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white" />
</p>

---

## Sumário

- [O problema](#o-problema)
- [A solução](#a-solução)
- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Banco de dados](#banco-de-dados)
- [Regras de negócio](#regras-de-negócio)
- [Transações e concorrência](#transações-e-concorrência)
- [Endpoints](#endpoints)
- [Exemplos de uso da API](#exemplos-de-uso-da-api)
- [Como executar](#como-executar)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Testes](#testes)
- [Docker](#docker)
- [Screenshots](#screenshots)
- [Conceitos de backend praticados](#conceitos-de-backend-praticados)
- [Decisões e trade-offs](#decisões-e-trade-offs)
- [Melhorias futuras](#melhorias-futuras)

---

## O problema

Uma empresa pequena — 50 produtos, 3 pessoas mexendo no estoque — controla tudo em planilha ou
caderno. Os problemas que aparecem sempre:

| Sintoma | Causa raiz |
|---|---|
| "O sistema diz 12, mas tem 9 na prateleira" | O saldo é **digitado à mão**; qualquer erro de digitação vira verdade |
| "Quem tirou essas 3 unidades?" | Não existe histórico, apenas o número final |
| "Descobrimos que acabou quando o cliente pediu" | Ninguém compara o saldo com o mínimo |
| Duas pessoas editam ao mesmo tempo | A última a salvar apaga o trabalho da outra |

O denominador comum: **o saldo é tratado como um campo editável, quando na verdade ele é uma
consequência.**

## A solução

Uma API REST onde ninguém escreve o saldo. Ele muda **apenas como efeito de uma movimentação
registrada**, dentro de uma transação, com autor identificado.

Três consequências de projeto que vêm daí:

1. `PATCH /products/:id` **não aceita** `stockQuantity` — nem para o administrador. A API responde
   422 explicando qual é o caminho correto.
2. Movimentação é **imutável**: não existe `PATCH` nem `DELETE` em `/movements`. Errou? Registra a
   movimentação contrária, como um estorno contábil. Apagar histórico é reescrever o passado.
3. Criar a movimentação e atualizar o saldo é **uma operação só** — ou as duas acontecem, ou nenhuma.

---

## Funcionalidades

**Implementado**

- Cadastro e login com JWT; senhas com hash bcrypt
- Dois papéis (`ADMIN` / `EMPLOYEE`) com permissões distintas
- CRUD de produtos, com SKU único e exclusão lógica
- Categorias
- Registro de entradas e saídas, com transação e proteção contra concorrência
- Histórico de movimentações — global e por produto — com filtros e paginação
- Listagem de produtos com busca, filtro por categoria, filtro de estoque baixo e paginação
- Dashboard com totais agregados calculados no banco
- Frontend em HTML/CSS/JS puro consumindo a API
- Suíte de testes de integração contra PostgreSQL real

**Deliberadamente fora do escopo** — e saber justificar isso vale mais que uma tela a mais:

| Fora | Por quê |
|---|---|
| Fornecedores, compras, notas fiscais | Vira ERP. O MVP responde uma pergunta: *quanto tem e quem mexeu* |
| Upload de imagem de produto | Não exercita nenhum conceito de backend novo |
| Refresh token | Complexidade real; mitigado com expiração curta + verificação de conta ativa |
| Multiempresa (multi-tenant) | Muda a modelagem inteira; é evolução, não MVP |
| Relatórios em PDF/Excel | Formatação, não backend |

### Permissões

| Ação | ADMIN | EMPLOYEE |
|---|:---:|:---:|
| Visualizar produtos e movimentações | ✅ | ✅ |
| Registrar entradas e saídas | ✅ | ✅ |
| Criar, editar e excluir produtos | ✅ | ❌ |
| Criar categorias | ✅ | ❌ |

O funcionário pode movimentar o estoque porque é ele quem está no depósito. Se só o administrador
pudesse, o sistema seria contornado na prática — as pessoas anotariam no papel para lançar depois, e
o saldo em tela nunca corresponderia à prateleira. O que protege o sistema não é proibir o
funcionário de movimentar, e sim **registrar quem movimentou**: a auditoria substitui a restrição.

---

## Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Runtime | Node.js 20+ (ESM) | JavaScript no servidor, sem etapa de build |
| Framework | Express 4 | Roteamento e pilha de middlewares, sem opinião demais |
| Banco | PostgreSQL 16 | Relacional, com transações e tipo `NUMERIC` exato para dinheiro |
| ORM | Prisma 6 | Schema como fonte da verdade, migrations versionadas, queries parametrizadas |
| Autenticação | jsonwebtoken + bcryptjs | Padrão de mercado para token e hash de senha |
| Validação | Zod | Schema declarativo que valida e converte na borda |
| Segurança | helmet, cors, express-rate-limit | Headers, política de origem e limite de tentativas |
| Testes | `node:test` + supertest | Runner nativo, sem dependência extra |
| Infra | Docker Compose | O banco como dependência declarada do projeto |
| Frontend | HTML, CSS e JS puros | O foco é o backend; sem framework, sem build |

Nenhuma dependência foi adicionada sem necessidade — o logger, por exemplo, tem 40 linhas escritas à
mão em vez de winston ou pino.

---

## Arquitetura

```
   Requisição HTTP
         │
   ┌─────▼──────┐
   │   route    │  define o caminho e quem pode passar
   └─────┬──────┘
   ┌─────▼──────────────────────────────┐
   │ middlewares                        │
   │  authenticate → authorize → validate│
   └─────┬──────────────────────────────┘
   ┌─────▼──────┐
   │ controller │  traduz HTTP ⇄ domínio: lê req, chama service, devolve status
   └─────┬──────┘
   ┌─────▼──────┐
   │  service   │  REGRAS DE NEGÓCIO — não conhece req, res nem status code
   └─────┬──────┘
   ┌─────▼──────┐
   │   prisma   │  acesso ao banco
   └─────┬──────┘
     PostgreSQL
```

**Por que o service não conhece HTTP.** O service `movement.create()` precisa funcionar igual se
amanhã for chamado por um script de importação, por um job agendado ou por um teste. Se ele chamasse
`res.status(400)`, estaria preso ao Express para sempre. Em vez disso ele lança um erro tipado
(`new BadRequestError(...)`) que carrega o status como **dado**; o `errorHandler`, na fronteira,
lê esse dado e monta a resposta.

**Por que não existe camada de repositories.** O Prisma Client já é a camada de abstração de dados —
colocar um repository em cima dele seria um envelope dentro de outro. Repositories se justificam
quando há SQL escrito à mão para isolar. Aqui, os services falam com o Prisma diretamente.

---

## Banco de dados

### Entidades e cardinalidade

```
Category 1 ──< N Product 1 ──< N StockMovement N >── 1 User
```

- Uma **categoria** tem muitos **produtos**; um produto pertence a uma categoria.
- Um **produto** tem muitas **movimentações**; uma movimentação pertence a um produto.
- Um **usuário** registra muitas **movimentações**; uma movimentação tem exatamente um autor.

Em toda relação 1:N a chave estrangeira mora do lado N. `StockMovement` tem **duas** chaves
estrangeiras para tabelas diferentes: é ela que amarra *o que mudou* com *quem mudou*.

### Tabelas

**users**

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| name | varchar(120) | |
| email | varchar(160) **UNIQUE** | identificador do login |
| password | varchar(255) | hash bcrypt, nunca a senha |
| role | enum(ADMIN, EMPLOYEE) | default `EMPLOYEE` |
| is_active | boolean | desligar sem apagar o histórico |
| created_at / updated_at | timestamp | |

**categories** — `id`, `name` (UNIQUE), `created_at`

**products**

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| name | varchar(160) | |
| description | varchar(500) NULL | opcional |
| sku | varchar(60) **UNIQUE** | normalizado para maiúsculas |
| price | **numeric(10,2)** | ver nota sobre dinheiro |
| stock_quantity | integer | **só o service de movimentação escreve aqui** |
| minimum_stock | integer | limiar de alerta |
| category_id | integer FK → categories | `ON DELETE RESTRICT` |
| is_active | boolean | exclusão lógica |
| created_at / updated_at | timestamp | |

**stock_movements**

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| type | enum(ENTRY, EXIT) | |
| quantity | integer | sempre positiva — o sentido vem do `type` |
| product_id | integer FK → products | `ON DELETE RESTRICT` |
| user_id | integer FK → users | `ON DELETE RESTRICT` |
| created_at | timestamp | |

### Políticas de exclusão

| Relação | Política | Motivo |
|---|---|---|
| Category → Product | `RESTRICT` | Apagar uma categoria não pode deixar produtos órfãos |
| Product → StockMovement | `RESTRICT` | O histórico é sagrado — por isso produto usa exclusão lógica |
| User → StockMovement | `RESTRICT` | Se o autor sumisse, o histórico ficaria anônimo |

As três serem `RESTRICT` é o que obriga `User` e `Product` a terem `is_active`: o sistema precisa de
uma forma de "remover" sem destruir a auditoria.

### Decisões de modelagem

**`price` é `numeric`, nunca `float`.** Em ponto flutuante, `0.1 + 0.2` dá `0.30000000000000004`.
Multiplique por milhares de itens e o valor total do estoque fica errado. `numeric` faz aritmética
exata em base 10 — é o tipo feito para dinheiro.

**`stock_quantity` é uma redundância proposital.** O saldo poderia ser sempre calculado
(`SUM(entradas) - SUM(saídas)`) — seria a modelagem pura, impossível de dessincronizar. Guardamos o
valor mesmo assim porque listar 50 produtos exigiria 50 agregações, e o saldo é lido centenas de
vezes para cada vez que é escrito. O preço dessa escolha é que o campo *pode* divergir do histórico
se alguém escrever nele fora de uma transação — e é exatamente por isso que existe **uma única porta
de escrita** para ele, em `movement.service.js`.

**Índices.** `email`, `sku` e `category.name` únicos; `products(category_id)` e `products(name)` para
filtro e ordenação; `stock_movements(product_id, created_at)` composto para o histórico por produto;
`stock_movements(created_at)` para o dashboard. Índice acelera leitura e custa escrita — só indexamos
o que é filtrado ou ordenado com frequência.

---

## Regras de negócio

Todas implementadas no backend, e essa não é uma preferência de estilo:

1. **O frontend é território do usuário.** Todo o JavaScript enviado ao navegador pode ser lido,
   editado ou ignorado. Qualquer pessoa abre o DevTools e dispara a requisição na mão. Validação no
   frontend é *conveniência*; no backend é *garantia*.
2. **O backend é o único ponto por onde todos passam.** Amanhã existe um app mobile ou um script de
   importação. Se a regra "não pode sair mais do que tem" mora na tela, cada novo cliente precisa
   reimplementá-la — e vai errar.
3. **Só o backend enxerga o estado real.** O frontend viu "10 unidades" há 30 segundos; nesse
   intervalo outra pessoa tirou 8. Apenas o servidor, dentro de uma transação, sabe o número no
   instante da decisão.
4. **Consistência exige transação.** O frontend faria duas chamadas e poderia morrer no meio da
   segunda.

| # | Regra | Onde é garantida |
|---|---|---|
| 1 | SKU não pode duplicar | Índice `UNIQUE` no banco → erro `P2002` traduzido para **409** |
| 2 | Saída não pode exceder o estoque | `UPDATE` condicional dentro da transação → **400** |
| 3 | Quantidade maior que zero | Zod (**422**) + `CHECK` opcional no banco |
| 4 | `ENTRY` aumenta o estoque | `movement.service.js`, dentro da transação |
| 5 | `EXIT` diminui o estoque | idem |
| 6 | Abaixo do mínimo é `LOW STOCK` | Comparação entre colunas no banco (`stock_quantity <= minimum_stock`) |
| 7 | Movimentação registra o autor | `userId` extraído do JWT, **nunca** do corpo da requisição |
| 8 | Estoque não muda pelo frontend | `PATCH` recusa `stockQuantity` com 422 e mensagem explicativa |

---

## Transações e concorrência

O trecho mais importante do projeto. Registrar uma saída são duas escritas:

1. `INSERT` em `stock_movements` — o registro do fato
2. `UPDATE` em `products` — o saldo

### Problema 1 — atomicidade

Sem transação, se a primeira funciona e a segunda falha (queda de conexão, processo morto, deploy no
meio), o banco fica **mentindo**: existe uma saída de 3 unidades registrada que nunca foi descontada.
Ninguém percebe até o inventário.

```
BEGIN ──> INSERT movimento ──> UPDATE saldo ──> COMMIT   (as duas valem)
                    │
              qualquer erro ──> ROLLBACK                 (nenhuma vale)
```

Implementado com `prisma.$transaction(async (tx) => { ... })`. Detalhe que importa: dentro do
callback usa-se `tx`, não `prisma` — uma chamada com `prisma` ali dentro sairia **por fora** da
transação e não seria desfeita pelo rollback.

### Problema 2 — concorrência

A sequência intuitiva — ler o saldo, comparar, gravar — falha com duas requisições simultâneas:

```
Requisição A: lê 10
Requisição B: lê 10          ← ainda não houve escrita
Requisição A: 10 >= 8, ok
Requisição B: 10 >= 8, ok    ← decide com número desatualizado
Requisição A: grava 2
Requisição B: grava 2        ← deveria ser -6, e sobrescreve A
```

Saíram 16 unidades de um estoque de 10. Isso é uma **race condition**, e a transação sozinha, no
nível de isolamento padrão do PostgreSQL (`READ COMMITTED`), **não** impede esse cenário: ela garante
"tudo ou nada", não garante que ninguém mexeu no meio do caminho.

**A solução usada aqui** é colocar a verificação dentro da própria escrita:

```sql
UPDATE products
   SET stock_quantity = stock_quantity - 8
 WHERE id = 1 AND stock_quantity >= 8;
```

Duas propriedades salvam a operação:

- `stock_quantity - 8` é calculado **pelo banco**, sobre o valor atual da linha no instante da
  escrita — não sobre um número lido há 50 ms;
- o `WHERE` é avaliado no momento do `UPDATE`. O PostgreSQL bloqueia a linha, então a segunda
  requisição espera, reavalia a condição com o saldo já atualizado e não atualiza nada.

O banco informa quantas linhas foram afetadas; `count === 0` significa "a condição não valia mais" —
e é assim que descobrimos que faltou estoque, com base no estado real. Como o `INSERT` do movimento
só acontece depois desse `UPDATE`, na mesma transação, **é impossível existir movimentação registrada
sem o saldo correspondente**.

Alternativas consideradas: `SELECT ... FOR UPDATE` (funciona, mas é uma ida a mais ao banco e segura
a linha por mais tempo) e `isolationLevel: 'Serializable'` (correto, porém mais caro e exige lógica
de repetição no código).

> Existe um teste que dispara **20 saídas simultâneas** contra um estoque de 10 e verifica que
> exatamente 10 passam, o saldo termina em 0 e o histórico bate. Uma implementação ingênua passa em
> todos os outros testes e falha nesse.

---

## Endpoints

Base: `http://localhost:3000/api`

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/health` | público | Estado da API e da conexão com o banco |
| POST | `/auth/register` | público | Cadastro — cria **sempre** `EMPLOYEE` |
| POST | `/auth/login` | público | Devolve o JWT |
| GET | `/auth/me` | autenticado | Dados do usuário logado |
| GET | `/categories` | autenticado | Lista categorias com contagem de produtos |
| POST | `/categories` | **ADMIN** | Cria categoria |
| GET | `/products` | autenticado | Busca, filtros e paginação |
| GET | `/products/:id` | autenticado | Detalhe |
| POST | `/products` | **ADMIN** | Cria produto (aceita `initialStock`) |
| PATCH | `/products/:id` | **ADMIN** | Atualização parcial — **recusa `stockQuantity`** |
| DELETE | `/products/:id` | **ADMIN** | Exclusão lógica |
| GET | `/products/:id/movements` | autenticado | Histórico do produto |
| GET | `/movements` | autenticado | Histórico geral com filtros |
| POST | `/movements` | autenticado | **Registra entrada ou saída** (transação) |
| GET | `/dashboard/summary` | autenticado | Todos os números do painel |

### Decisões sobre a API

**`POST /movements` com `productId` no corpo**, e não `POST /products/:id/movements`. Motivo: existe
**um único ponto de escrita** de estoque no sistema inteiro — mais fácil de auditar, testar e
proteger. Já a *leitura* aninhada (`GET /products/:id/movements`) faz sentido porque a URL descreve
exatamente o recurso pedido: "o histórico deste produto".

**Não existe `PATCH` nem `DELETE` em `/movements`.** Movimentação é fato consumado.

**`PATCH` e não `PUT` em produtos.** `PUT` substitui o recurso inteiro — campos omitidos deveriam ser
apagados. Como as edições são parciais, `PATCH` é o verbo honesto.

**`register` sempre cria `EMPLOYEE`.** Se o `role` viesse do corpo, qualquer pessoa se tornaria
administrador enviando `"role": "ADMIN"` — a falha conhecida como *mass assignment*. O primeiro
`ADMIN` nasce no seed.

### Parâmetros da listagem de produtos

```
GET /api/products?search=mouse&category=2&lowStock=true&page=1&limit=10&sort=name&order=asc
```

| Parâmetro | Efeito |
|---|---|
| `search` | Busca em nome **ou** SKU, sem diferenciar maiúsculas (`ILIKE`) |
| `category` | Filtra por `category_id` |
| `lowStock` | `true` → `stock_quantity <= minimum_stock` (comparação entre colunas) |
| `includeInactive` | Inclui produtos desativados (ocultos por padrão) |
| `page`, `limit` | Paginação; `limit` tem teto de 100 |
| `sort`, `order` | Ordenação restrita a uma **lista branca** de colunas |

**Como a API processa esses parâmetros:** a query string é sempre texto — `page` chega como `"1"` e
`lowStock` como `"true"` (e `"false"` também seria *truthy* em JavaScript). O Zod converte e valida
tudo na borda: número vira número, `"true"/"false"` vira boolean de verdade, `limit` é preso ao teto
e `sort` é conferido contra a lista branca. Cada filtro presente **soma** uma condição ao objeto
`where` — como o Prisma combina as chaves com `AND`, todas as combinações funcionam sem um `if` para
cada uma. Por fim, os dados e o `count` são buscados em paralelo com `Promise.all`, usando
rigorosamente o **mesmo** `where` — se divergissem, o `totalPages` mentiria e o usuário cairia em
páginas vazias.

### Formato das respostas

```jsonc
// sucesso
{ "success": true, "message": "...", "data": { }, "meta": { } }

// erro
{ "success": false, "message": "Produto não encontrado" }

// erro de validação (422)
{
  "success": false,
  "message": "Falha na validação dos dados enviados",
  "errors": [{ "field": "price", "message": "O preço deve ser maior que zero" }]
}
```

| Status | Quando |
|---|---|
| 200 / 201 / 204 | Sucesso, criação, sucesso sem corpo |
| 400 | Requisição inválida (ex.: estoque insuficiente) |
| 401 | Não autenticado — token ausente, inválido ou expirado |
| 403 | Autenticado, mas sem permissão |
| 404 | Recurso não encontrado |
| 409 | Conflito (SKU ou email duplicado) |
| 422 | Dados não passaram na validação |
| 503 | Banco de dados indisponível |

---

## Exemplos de uso da API

**Login**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stockflow.com","password":"Admin@123"}'
```

```json
{
  "success": true,
  "message": "Login realizado com sucesso",
  "data": {
    "user": { "id": 1, "name": "Administrador", "email": "admin@stockflow.com", "role": "ADMIN" },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Criar produto**

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mouse Logitech M170",
    "sku": "PER-001",
    "price": 79.90,
    "minimumStock": 10,
    "categoryId": 2,
    "initialStock": 10
  }'
```

**Registrar uma entrada**

```bash
curl -X POST http://localhost:3000/api/movements \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"ENTRY","quantity":5,"productId":1}'
```

```json
{
  "success": true,
  "message": "Entrada registrada. Estoque atual: 15.",
  "data": {
    "movement": { "id": 2, "type": "ENTRY", "quantity": 5, "productId": 1,
                  "user": { "id": 1, "name": "Administrador" } },
    "product": { "id": 1, "sku": "PER-001", "stockQuantity": 15, "isLowStock": false }
  }
}
```

**Saída maior que o estoque**

```bash
curl -X POST http://localhost:3000/api/movements \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"EXIT","quantity":999,"productId":1}'
```

```json
{
  "success": false,
  "message": "Estoque insuficiente para \"Mouse Logitech M170\" (PER-001). Disponível: 15, solicitado: 999."
}
```

Nenhuma movimentação é gravada e o saldo permanece intacto — a transação foi desfeita por inteiro.

**Tentar alterar o estoque diretamente**

```bash
curl -X PATCH http://localhost:3000/api/products/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stockQuantity": 999}'
```

```json
{
  "success": false,
  "message": "Falha na validação dos dados enviados",
  "errors": [{
    "field": "stockQuantity",
    "message": "O estoque não pode ser alterado diretamente. Registre uma movimentação em POST /api/movements."
  }]
}
```

**Filtrar produtos com estoque baixo**

```bash
curl "http://localhost:3000/api/products?lowStock=true&page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Como executar

### Pré-requisitos

- [Node.js](https://nodejs.org) 20 ou superior
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (para o PostgreSQL)

### Passo a passo

```bash
# 1. Instalar dependências
npm install

# 2. Configurar o ambiente
cp .env.example .env        # no Windows: copy .env.example .env

# 3. Subir o PostgreSQL
docker compose up -d

# 4. Criar as tabelas
npm run db:migrate

# 5. (opcional) Constraints CHECK — a última linha de defesa
npm run db:constraints

# 6. Popular com dados de demonstração
npm run db:seed

# 7. Rodar
npm run dev
```

- Painel: <http://localhost:3000>
- API: <http://localhost:3000/api>
- Health check: <http://localhost:3000/api/health>

### Contas criadas pelo seed

| Perfil | Email | Senha |
|---|---|---|
| ADMIN | `admin@stockflow.com` | `Admin@123` |
| EMPLOYEE | `funcionario@stockflow.com` | `Func@123` |

### Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor com recarga automática |
| `npm start` | Servidor em modo produção |
| `npm run db:migrate` | Cria/aplica migrations |
| `npm run db:seed` | Popula o banco |
| `npm run db:reset` | Recria o banco do zero |
| `npm run db:studio` | Interface visual do Prisma |
| `npm run db:constraints` | Aplica as constraints `CHECK` |
| `npm test` | Suíte completa (exige banco no ar) |
| `npm run test:unit` | Apenas testes unitários (não exige banco) |
| `npm run test:smoke` | Verificação da fronteira HTTP (não exige banco) |
| `npm run docker:up` / `docker:down` | Sobe/derruba o PostgreSQL |

---

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|:---:|---|---|
| `NODE_ENV` | não | `development` | `development`, `production` ou `test` |
| `PORT` | não | `3000` | Porta da API |
| `DATABASE_URL` | **sim** | — | String de conexão do PostgreSQL |
| `TEST_DATABASE_URL` | só p/ testes | — | Banco separado — a suíte **apaga todas as tabelas** |
| `JWT_SECRET` | **sim** | — | Segredo de assinatura dos tokens |
| `JWT_EXPIRES_IN` | não | `8h` | Validade do token |
| `BCRYPT_SALT_ROUNDS` | não | `10` | Custo do hash; cada +1 dobra o tempo |
| `CORS_ORIGIN` | não | `*` | Origens autorizadas, separadas por vírgula |
| `LOG_LEVEL` | não | `info` | `error`, `warn`, `info` ou `debug` |

`JWT_SECRET` e `DATABASE_URL` não têm valor padrão de propósito: um segredo *default* seria um buraco
de segurança que ninguém percebe até chegar em produção. A aplicação morre no boot, com mensagem
clara, se faltarem.

---

## Estrutura de pastas

```
stockflow/
├── docker-compose.yml          PostgreSQL (+ API, sob demanda)
├── Dockerfile                  imagem da API
├── docker/
│   └── init-test-db.sql        cria o banco de teste na primeira subida
├── prisma/
│   ├── schema.prisma           modelos, enums e relações
│   ├── migrations/             histórico versionado do banco
│   ├── seed.js                 admin inicial, categorias e produtos demo
│   └── sql/constraints.sql     constraints CHECK (opcional)
├── src/
│   ├── server.js               sobe a porta e faz o graceful shutdown
│   ├── app.js                  monta o Express (testável sem porta)
│   ├── config/
│   │   ├── env.js              lê e valida as variáveis de ambiente
│   │   └── prisma.js           instância única do Prisma Client
│   ├── routes/                 mapa da API, um arquivo por recurso
│   ├── controllers/            traduzem HTTP ⇄ domínio
│   ├── services/               regras de negócio
│   ├── middlewares/            auth, validação, erros, log de acesso
│   ├── validators/             schemas Zod
│   ├── errors/                 AppError e suas especializações
│   ├── constants/              papéis, tipos, limites, listas brancas
│   └── utils/                  jwt, senha, paginação, logger, serialização
├── tests/
│   ├── helpers/setup.js        ambiente e atalhos de cenário
│   ├── auth.test.js
│   ├── product.test.js
│   ├── movement.test.js
│   ├── unit/                   funções puras
│   └── smoke.mjs               fronteira HTTP, sem banco
└── public/                     frontend (HTML, CSS e JS puros)
```

---

## Testes

```bash
npm test              # suíte completa — exige PostgreSQL no ar
npm run test:unit     # funções puras, roda em milissegundos
npm run test:smoke    # fronteira HTTP sem banco
```

Os testes de integração rodam contra um **PostgreSQL real**, e não contra um mock. O motivo é direto:
um Prisma simulado devolveria o que mandássemos devolver — ele não tem constraint `UNIQUE`, não tem
chave estrangeira, não tem transação e não tem bloqueio de linha. Ou seja, justamente as coisas que
este projeto precisa provar que funcionam. Testar isso contra mock seria testar o mock.

O banco de teste é separado (`stockflow_test`, criado automaticamente pelo Docker) e as tabelas são
zeradas entre os testes — nenhum teste pode depender do que outro deixou para trás.

### O que cada grupo verifica

**Autenticação** (`auth.test.js`)

| Teste | O que protege |
|---|---|
| Cadastro devolve token sem expor a senha | Vazamento de hash por descuido na serialização |
| `role` enviado pelo cliente é ignorado | **Mass assignment** — virar `ADMIN` com uma linha de JSON |
| Email duplicado → 409 | A constraint `UNIQUE` vira erro tratado, não 500 |
| Senha fraca → 422 apontando o campo | Validação na borda, com resposta útil |
| Senha errada → 401 | Prova que o bcrypt realmente compara |
| Mensagem igual para email inexistente e senha errada | **Enumeração de usuários** |
| Rota protegida sem token → 401 | Rota realmente protegida |
| Token inválido → 401 | Ninguém forja token trocando o payload |
| Token de usuário desativado → 401 | Por que o middleware consulta o banco em vez de confiar no token |

**Produtos** (`product.test.js`)

| Teste | O que protege |
|---|---|
| ADMIN cria; EMPLOYEE recebe 403 | Autorização por papel — e a diferença entre 401 e 403 |
| SKU duplicado → 409 | Regra 1 |
| `per-001` colide com `PER-001` | Normalização impede duplicata disfarçada |
| Preço zero → 422 | Regra de preço positivo |
| Categoria inexistente → 404 | Integridade referencial com mensagem clara |
| `initialStock` gera a entrada correspondente | Todo saldo tem origem num movimento |
| `PATCH` com `stockQuantity` → 422 e saldo intacto | **Regra 8**, a mais importante |
| `DELETE` desativa e preserva o histórico | Exclusão lógica |
| Busca, filtro de estoque baixo, paginação | Regra 6 e a coerência do `meta.total` |
| `limit` acima do teto e `sort` fora da lista branca → 422 | Proteção contra abuso de query string |

**Movimentações** (`movement.test.js`)

| Teste | O que protege |
|---|---|
| `ENTRY` soma, `EXIT` subtrai | Regras 4 e 5 |
| Autor vem do token, `userId` do corpo é ignorado | Regra 7 — falsificação de histórico |
| Saída maior que o estoque → 400 | Regra 2 |
| **Saída recusada não deixa rastro** | A transação de fato desfaz tudo |
| Quantidade 0, negativa ou fracionada → 422 | Regra 3 |
| Produto desativado não aceita movimentação | Coerência com a exclusão lógica |
| **20 saídas simultâneas, 10 passam** | **Race condition** — o teste mais importante |
| 10 entradas simultâneas somam todas | *Lost update* |
| Não existe rota para editar/apagar movimentação | Congela a decisão de imutabilidade |
| Dashboard bate com o estoque | Agregações corretas |

---

## Docker

```bash
docker compose up -d          # só o PostgreSQL (uso normal em desenvolvimento)
docker compose --profile full up --build   # PostgreSQL + API em container
docker compose down           # derruba, preservando os dados
docker compose down -v        # derruba e apaga o volume
```

**Por que Docker neste projeto** — resposta curta para entrevista: *para que o banco seja uma
dependência declarada do projeto, e não uma instalação manual na máquina de quem for rodar.*

Sem Docker, executar o projeto exigiria baixar o instalador do PostgreSQL, instalar, lembrar a senha
do usuário `postgres`, criar o banco à mão e torcer para a versão ser compatível. Com Docker, um
comando resolve. Ganhos concretos:

- **Paridade de versão** — todo mundo roda PostgreSQL 16, inclusive o servidor.
- **Isolamento** — não conflita com outro Postgres já instalado na máquina.
- **Descartável** — `docker compose down -v` apaga tudo e recomeça do zero.
- **O banco de teste já nasce criado**, por um script de inicialização.

O `healthcheck` existe para que o container só seja considerado pronto quando o Postgres realmente
aceitar conexões — sem ele, a API tentaria conectar cedo demais.

---

## Screenshots

> Coloque as imagens em `docs/screenshots/` e ajuste os caminhos abaixo.

| Tela | |
|---|---|
| Login | `docs/screenshots/login.png` |
| Dashboard | `docs/screenshots/dashboard.png` |
| Produtos com filtros | `docs/screenshots/produtos.png` |
| Registro de movimentação | `docs/screenshots/movimentacao.png` |
| Histórico | `docs/screenshots/movimentacoes.png` |

---

## Conceitos de backend praticados

| Conceito | Onde está no projeto |
|---|---|
| **REST API** | Recursos no plural, verbos com semântica correta, status apropriados |
| **HTTP** | Diferença entre 401 e 403, `PATCH` vs `PUT`, 204 sem corpo, cabeçalhos de segurança |
| **Middleware** | `authenticate`, `authorize`, `validate`, `requestLogger`, `errorHandler` — e por que a ordem importa |
| **JWT** | `src/utils/jwt.js`; por que o payload não é secreto e o que a assinatura garante |
| **Autenticação** | bcrypt com salt, comparação em tempo constante, mensagem genérica no login |
| **Autorização** | `authorize()` como fábrica de middlewares (closure); papéis por rota |
| **CRUD** | Produtos e categorias |
| **PostgreSQL** | Tipos (`numeric`, `enum`), constraints, índices simples e compostos |
| **Relacionamentos** | 1:N em três relações, duas FKs na mesma tabela, políticas de exclusão |
| **ORM** | Prisma Client; e o momento de descer para `$queryRaw` |
| **Migrations** | Estrutura do banco versionada junto com o código |
| **Transactions** | `$transaction` na movimentação; atomicidade e `UPDATE` condicional contra race condition |
| **Validação** | Zod na borda, com coerção de tipos e lista branca |
| **Tratamento de erros** | Erros tipados + handler centralizado; tradução de códigos do Prisma |
| **Paginação** | `skip`/`take`, `meta` completo, teto de `limit`, `count` com o mesmo `where` |
| **Regras de negócio** | Concentradas nos services, fora do controller e fora do frontend |
| **Testes** | Integração com banco real, unitários e teste de concorrência |
| **Docker** | Compose para o banco, Dockerfile com cache em camadas e usuário sem privilégios |
| **Segurança** | helmet, CORS, rate limit, variáveis de ambiente, proteção contra mass assignment, XSS e SQL injection |

### Propósito de cada mecanismo de segurança

| Mecanismo | Contra o quê |
|---|---|
| **bcrypt** | Vazamento do banco. Hash é via única e lento de propósito; SHA-256 é rápido demais e cai por força bruta em GPU |
| **Salt** | *Rainbow tables* — dois usuários com a mesma senha têm hashes diferentes |
| **JWT** | HTTP é stateless; o token carrega a identidade assinada, sem sessão no servidor |
| **Middleware de autenticação** | Rota protegida sem repetir a verificação em cada controller; recarrega o usuário do banco para refletir mudanças de papel |
| **Autorização por papel** | Funcionário não altera o catálogo |
| **Variáveis de ambiente** | Segredo fora do Git; rotacionar senha sem alterar código |
| **CORS** | Site malicioso em outra aba chamando a API com as credenciais do usuário. *Instrui o navegador — não substitui autenticação* |
| **Helmet** | Classes inteiras de ataque no navegador (sniffing de MIME, clickjacking, HTTPS não forçado) |
| **Rate limit** | Força bruta nas rotas de credencial |
| **Validação de entrada** | Dado malformado chegando ao banco; `limit` abusivo derrubando o servidor |
| **Lista branca de ordenação** | Cliente escolhendo colunas arbitrárias na cláusula `ORDER BY` |
| **Queries parametrizadas** | SQL injection (garantido pelo Prisma; `$queryRaw` usa template com parâmetros) |
| **`escapeHtml` no frontend** | XSS armazenado — um produto chamado `<img src=x onerror=...>` |

---

## Decisões e trade-offs

Decisões tomadas sabendo o que se perdeu.

| Decisão | O que ganhamos | O que abrimos mão |
|---|---|---|
| Saldo guardado em `products` | Listagem rápida, filtro de estoque baixo simples | Redundância que depende da transação para não divergir |
| ORM em vez de SQL à mão | Velocidade, tipagem, migrations, segurança por padrão | Controle fino sobre o SQL gerado |
| Sem camada de repositories | Menos indireção; o Prisma já é essa camada | Trocar de ORM exigiria mexer nos services |
| Exclusão lógica | Histórico e relatórios preservados | Toda consulta precisa lembrar de filtrar `isActive` |
| `UPDATE` condicional em vez de `SERIALIZABLE` | Sem lógica de repetição; uma ida ao banco | Solução específica para este caso, não genérica |
| JWT sem refresh token | Menos complexidade, sem estado no servidor | Não há revogação antes de expirar (mitigado com 8h + checagem de `isActive`) |
| Token no `localStorage` | Simplicidade da demonstração | Vulnerável a XSS; cookie `httpOnly` seria mais seguro |
| Logger próprio | Zero dependência, 40 linhas legíveis | Sem log estruturado em JSON, sem transportes, sem rotação |
| Rate limit em memória | Sem Redis no MVP | Não funciona com várias instâncias; zera ao reiniciar |
| Busca com `ILIKE %termo%` | Simples e suficiente para o volume de um MVP | Não usa índice; com milhares de produtos exigiria `pg_trgm` |
| Frontend sem framework | Foco no backend, sem etapa de build | Código de UI mais verboso |

---

## Melhorias futuras

**Curto prazo**

- [ ] CI no GitHub Actions rodando lint e testes a cada push
- [ ] Cobertura de testes com `node --test --experimental-test-coverage`
- [ ] Documentação OpenAPI servida em `/api/docs`
- [ ] Ajuste de estoque com motivo (perda, avaria, inventário) como um terceiro tipo de movimentação

**Médio prazo**

- [ ] Refresh token com rotação e revogação
- [ ] Gestão de usuários pelo ADMIN (ativar, desativar, promover)
- [ ] Exportação do histórico em CSV
- [ ] Busca textual com `pg_trgm` para escalar além de alguns milhares de produtos
- [ ] Notificação por e-mail quando um produto cruza o estoque mínimo

**Longo prazo**

- [ ] Multiempresa com isolamento por `company_id`
- [ ] Migração para TypeScript
- [ ] Cache do dashboard em Redis — as agregações são as consultas mais caras
- [ ] Deploy (Render/Railway + Neon ou RDS)

---

## Licença

MIT.
