/**
 * TESTE DE FUMACA - roda SEM banco de dados.
 *
 *   npm run test:smoke
 *
 * A suite principal (`npm test`) precisa do PostgreSQL no ar. Este arquivo
 * verifica o que independe dele: se a aplicacao monta, se a ordem dos
 * middlewares esta correta e se a fronteira HTTP se comporta - 404, 401, 422,
 * headers de seguranca e o 503 de banco indisponivel.
 *
 * Serve para responder rapido a pergunta "quebrei alguma coisa?" antes mesmo de
 * subir o container. A extensao e `.mjs` de proposito: assim ele nao casa com o
 * padrao `*.test.js` e nao entra na suite principal.
 */
/**
 * ARMADILHA DE ESM QUE VALE CONHECER:
 *
 * `import` e HOISTED - todos os imports estaticos de um arquivo sao resolvidos e
 * executados ANTES da primeira linha do corpo do modulo. Ou seja, isto NAO
 * funciona:
 *
 *   process.env.LOG_LEVEL = 'error';   // parece vir primeiro...
 *   import app from '../src/app.js';   // ...mas ja rodou antes
 *
 * Quando `app.js` e avaliado, ele carrega `config/env.js`, que le
 * `process.env` na hora - e a atribuicao acima ainda nem aconteceu.
 *
 * Com CommonJS (`require`) a ordem seria a escrita. Com ESM, a unica forma de
 * garantir que a variavel esteja no lugar antes do modulo carregar e usar
 * `import()` dinamico, como abaixo.
 *
 * (E o mesmo motivo pelo qual `tests/helpers/setup.js` so carrega a aplicacao
 * por `import()` dentro de uma funcao.)
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

const { default: request } = await import('supertest');
const { default: app } = await import('../src/app.js');

let falhas = 0;
function check(nome, condicao, extra = '') {
  console.log(`${condicao ? 'OK  ' : 'FALHA'} ${nome}${extra ? ` -> ${extra}` : ''}`);
  if (!condicao) falhas += 1;
}

const notFound = await request(app).get('/api/rota-que-nao-existe');
check('404 em rota inexistente', notFound.status === 404 && notFound.body.success === false, notFound.status);

const semToken = await request(app).get('/api/products');
check('401 sem token em /products', semToken.status === 401, `${semToken.status} ${semToken.body.message}`);

const movSemToken = await request(app).post('/api/movements').send({ type: 'ENTRY', quantity: 1, productId: 1 });
check('401 sem token em /movements', movSemToken.status === 401, movSemToken.status);

const tokenInvalido = await request(app).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi');
check('401 com token invalido', tokenInvalido.status === 401, tokenInvalido.body.message);

const validacao = await request(app).post('/api/auth/register').send({ name: 'x', email: 'nao-e-email', password: '1' });
check(
  '422 com lista de campos invalidos',
  validacao.status === 422 &&
    Array.isArray(validacao.body.errors) &&
    ['name', 'email', 'password'].every((campo) => validacao.body.errors.some((e) => e.field === campo)),
  JSON.stringify(validacao.body.errors),
);

const jsonQuebrado = await request(app)
  .post('/api/auth/login')
  .set('Content-Type', 'application/json')
  .send('{ isso nao e json');
check('400 com JSON malformado', jsonQuebrado.status === 400, jsonQuebrado.body.message);

const frontend = await request(app).get('/');
check(
  'frontend estatico servido em /',
  frontend.status === 200 && frontend.text.includes('StockFlow'),
  frontend.status,
);

const helmet = await request(app).get('/');
check('header do helmet presente', helmet.headers['x-content-type-options'] === 'nosniff');
check('x-powered-by removido', helmet.headers['x-powered-by'] === undefined);

const cors = await request(app).get('/api/health').set('Origin', 'http://localhost:5500');
check('header de CORS presente', Boolean(cors.headers['access-control-allow-origin']));

// A unica rota que precisa do banco: deve devolver 503 traduzido, e nao um
// stack trace cru do Prisma.
check(
  'banco fora do ar vira 503 tratado, sem vazar stack',
  cors.status === 503 && cors.body.success === false && cors.body.stack === undefined,
  `${cors.status} ${cors.body.message}`,
);

console.log(falhas === 0 ? '\nTodos os testes de fumaca passaram.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
