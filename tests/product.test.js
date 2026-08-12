/**
 * TESTES DE PRODUTOS - CRUD, unicidade de SKU e autorizacao por papel.
 */
import {
  getApp,
  resetDatabase,
  closeDatabase,
  createUser,
  createCategory,
  login,
} from './helpers/setup.js';
import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

let app;
let adminToken;
let employeeToken;
let categoryId;

before(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDatabase();

  await createUser({ name: 'Admin', email: 'admin@stockflow.com', role: 'ADMIN' });
  await createUser({ name: 'Funcionario', email: 'func@stockflow.com', role: 'EMPLOYEE' });

  adminToken = await login(request, app, 'admin@stockflow.com');
  employeeToken = await login(request, app, 'func@stockflow.com');

  categoryId = (await createCategory('Perifericos')).id;
});

after(async () => {
  await closeDatabase();
});

/** Corpo valido reutilizavel - cada teste altera so o que lhe interessa. */
function productPayload(overrides = {}) {
  return {
    name: 'Mouse Logitech M170',
    description: 'Mouse sem fio',
    sku: 'PER-001',
    price: 79.9,
    minimumStock: 10,
    categoryId,
    ...overrides,
  };
}

describe('POST /api/products', () => {
  test('ADMIN cria produto e recebe 201', async () => {
    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload());

    assert.equal(response.status, 201);
    assert.equal(response.body.data.sku, 'PER-001');
    assert.equal(response.body.data.price, 79.9);
    // Sem estoque inicial, o produto nasce zerado - saldo so vem de movimentacao.
    assert.equal(response.body.data.stockQuantity, 0);
  });

  /**
   * AUTORIZACAO POR PAPEL. O funcionario esta autenticado (401 nao serve): o que
   * se prova aqui e que ele e reconhecido e mesmo assim BARRADO - 403. Confundir
   * os dois codigos e a pergunta de entrevista mais comum sobre o assunto.
   */
  test('EMPLOYEE nao pode criar produto - 403', async () => {
    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(productPayload({ sku: 'PER-002' }));

    assert.equal(response.status, 403);
  });

  test('sem token - 401', async () => {
    const response = await request(app).post('/api/products').send(productPayload());
    assert.equal(response.status, 401);
  });

  /**
   * REGRA 1: nao pode existir SKU duplicado.
   * Prova que a constraint UNIQUE do banco vira um 409 tratado, e nao um 500.
   */
  test('recusa SKU duplicado com 409', async () => {
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload());

    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload({ name: 'Outro mouse' }));

    assert.equal(response.status, 409);
    assert.match(response.body.message, /SKU/i);
  });

  // O SKU e normalizado para maiusculas na validacao. Sem isso, 'per-001' e
  // 'PER-001' virariam dois produtos - o indice unico do Postgres diferencia caixa.
  test('normaliza SKU para maiusculas, impedindo duplicata disfarcada', async () => {
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload({ sku: 'per-001' }));

    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload({ sku: 'PER-001', name: 'Outro' }));

    assert.equal(response.status, 409);
  });

  test('recusa preco zero ou negativo com 422', async () => {
    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload({ price: 0 }));

    assert.equal(response.status, 422);
    assert.ok(response.body.errors.some((e) => e.field === 'price'));
  });

  test('recusa categoria inexistente com 404', async () => {
    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload({ categoryId: 9999 }));

    assert.equal(response.status, 404);
  });

  /**
   * Estoque inicial gera a ENTRADA correspondente, na mesma transacao.
   * Isso sustenta a regra central do sistema: todo saldo tem origem num
   * movimento registrado - inclusive no cadastro.
   */
  test('estoque inicial cria a movimentacao de entrada correspondente', async () => {
    const created = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload({ initialStock: 15 }));

    assert.equal(created.status, 201);
    assert.equal(created.body.data.stockQuantity, 15);

    const movements = await request(app)
      .get(`/api/products/${created.body.data.id}/movements`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(movements.body.data.length, 1);
    assert.equal(movements.body.data[0].type, 'ENTRY');
    assert.equal(movements.body.data[0].quantity, 15);
  });
});

describe('PATCH /api/products/:id', () => {
  /**
   * REGRA 8, A MAIS IMPORTANTE DO PROJETO: o estoque nao se altera pelo cliente.
   *
   * Nao basta ignorar o campo em silencio - a API responde 422 explicando o
   * caminho correto. Um teste aqui impede que uma "conveniencia" futura reabra o
   * buraco que o sistema inteiro existe para fechar.
   */
  test('recusa alteracao direta de stockQuantity', async () => {
    const created = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload({ initialStock: 5 }));

    const response = await request(app)
      .patch(`/api/products/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stockQuantity: 999 });

    assert.equal(response.status, 422);

    // E o saldo permanece intocado.
    const after = await request(app)
      .get(`/api/products/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(after.body.data.stockQuantity, 5);
  });

  test('ADMIN atualiza preco e nome', async () => {
    const created = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload());

    const response = await request(app)
      .patch(`/api/products/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 89.9, name: 'Mouse Logitech M170 - novo lote' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.price, 89.9);
  });

  test('404 para produto inexistente', async () => {
    const response = await request(app)
      .patch('/api/products/9999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 10 });

    assert.equal(response.status, 404);
  });
});

describe('DELETE /api/products/:id', () => {
  /**
   * Exclusao LOGICA: o produto some das listagens, mas a linha - e todo o
   * historico ligado a ela - continua no banco.
   */
  test('desativa o produto sem apagar o registro', async () => {
    const created = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload({ initialStock: 3 }));

    const id = created.body.data.id;

    const removed = await request(app)
      .delete(`/api/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(removed.status, 204);

    // Sumiu da listagem padrao...
    const list = await request(app).get('/api/products').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(list.body.data.length, 0);

    // ...mas continua existindo, com o historico preservado.
    const detail = await request(app)
      .get(`/api/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.isActive, false);
  });

  test('EMPLOYEE nao pode excluir - 403', async () => {
    const created = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload());

    const response = await request(app)
      .delete(`/api/products/${created.body.data.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    assert.equal(response.status, 403);
  });
});

describe('GET /api/products - filtros e paginacao', () => {
  beforeEach(async () => {
    const produtos = [
      { name: 'Mouse Logitech', sku: 'PER-001', price: 79.9, minimumStock: 10, initialStock: 3 },
      { name: 'Teclado Mecanico', sku: 'PER-002', price: 249.9, minimumStock: 5, initialStock: 20 },
      { name: 'Monitor 24"', sku: 'ELE-001', price: 899.9, minimumStock: 4, initialStock: 12 },
    ];

    for (const produto of produtos) {
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(productPayload(produto));
    }
  });

  test('busca por nome, sem diferenciar maiusculas', async () => {
    const response = await request(app)
      .get('/api/products?search=mouse')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].sku, 'PER-001');
  });

  test('a mesma busca encontra por SKU', async () => {
    const response = await request(app)
      .get('/api/products?search=ELE')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].name, 'Monitor 24"');
  });

  /**
   * REGRA 6: produto no minimo ou abaixo dele e LOW STOCK.
   * O mouse tem 3 unidades para um minimo de 10 - e o unico que deve aparecer.
   */
  test('filtra por estoque baixo comparando duas colunas', async () => {
    const response = await request(app)
      .get('/api/products?lowStock=true')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].sku, 'PER-001');
    assert.equal(response.body.data[0].isLowStock, true);
  });

  test('pagina os resultados e devolve meta coerente', async () => {
    const response = await request(app)
      .get('/api/products?page=1&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.body.data.length, 2);
    assert.equal(response.body.meta.total, 3);
    assert.equal(response.body.meta.totalPages, 2);
    assert.equal(response.body.meta.hasNextPage, true);
    assert.equal(response.body.meta.hasPreviousPage, false);
  });

  /**
   * O `total` precisa refletir o FILTRO, e nao a tabela inteira. Se contasse tudo,
   * a paginacao levaria o usuario a paginas vazias - um bug classico.
   */
  test('o total considera o filtro aplicado', async () => {
    const response = await request(app)
      .get('/api/products?search=per&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.body.meta.total, 2);
  });

  // O teto de limite existe para impedir que uma URL derrube o banco.
  test('recusa limit acima do teto', async () => {
    const response = await request(app)
      .get('/api/products?limit=100000')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.status, 422);
  });

  // Lista branca de ordenacao: campo fora dela nao passa da validacao.
  test('recusa ordenacao por campo nao permitido', async () => {
    const response = await request(app)
      .get('/api/products?sort=password')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.status, 422);
  });

  test('EMPLOYEE pode listar produtos', async () => {
    const response = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${employeeToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 3);
  });
});
