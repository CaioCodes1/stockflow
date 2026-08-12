/**
 * TESTES DE MOVIMENTACAO - o nucleo do sistema.
 *
 * Estes sao os testes que realmente importam neste projeto. Eles nao verificam
 * "o endpoint responde 201"; verificam que o SALDO e o HISTORICO nunca divergem,
 * inclusive quando a operacao falha e inclusive sob requisicoes simultaneas.
 */
import {
  getApp,
  getPrisma,
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
let prisma;
let adminToken;
let employeeToken;
let productId;

before(async () => {
  app = await getApp();
  prisma = await getPrisma();
});

beforeEach(async () => {
  await resetDatabase();

  await createUser({ name: 'Admin', email: 'admin@stockflow.com', role: 'ADMIN' });
  await createUser({ name: 'Funcionario', email: 'func@stockflow.com', role: 'EMPLOYEE' });

  adminToken = await login(request, app, 'admin@stockflow.com');
  employeeToken = await login(request, app, 'func@stockflow.com');

  const category = await createCategory('Perifericos');

  const created = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Mouse Logitech M170',
      sku: 'PER-001',
      price: 79.9,
      minimumStock: 5,
      categoryId: category.id,
      initialStock: 10,
    });

  productId = created.body.data.id;
});

after(async () => {
  await closeDatabase();
});

function movement(token, body) {
  return request(app).post('/api/movements').set('Authorization', `Bearer ${token}`).send(body);
}

describe('POST /api/movements - entradas', () => {
  /** REGRA 4: ENTRY aumenta o estoque. O exemplo do enunciado: 10 + 5 = 15. */
  test('ENTRY soma ao estoque', async () => {
    const response = await movement(adminToken, { type: 'ENTRY', quantity: 5, productId });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.product.stockQuantity, 15);
    assert.equal(response.body.data.movement.type, 'ENTRY');
  });

  /**
   * REGRA 7: a movimentacao registra QUEM operou - e esse dado vem do token, nao
   * do corpo. Mandamos `userId` de outra pessoa de proposito: ele tem que ser
   * ignorado, senao o historico poderia ser falsificado.
   */
  test('registra o autor a partir do token, ignorando userId do corpo', async () => {
    const admin = await prisma.user.findUnique({ where: { email: 'admin@stockflow.com' } });

    const response = await movement(employeeToken, {
      type: 'ENTRY',
      quantity: 2,
      productId,
      userId: admin.id, // tentativa de se passar por outro usuario
    });

    assert.equal(response.status, 201);
    assert.notEqual(response.body.data.movement.userId, admin.id);
    assert.equal(response.body.data.movement.user.name, 'Funcionario');
  });

  /** EMPLOYEE movimenta o estoque - e o trabalho dele. */
  test('EMPLOYEE pode registrar entrada', async () => {
    const response = await movement(employeeToken, { type: 'ENTRY', quantity: 3, productId });
    assert.equal(response.status, 201);
  });
});

describe('POST /api/movements - saidas', () => {
  /** REGRA 5: EXIT diminui o estoque. O exemplo do enunciado: 15 - 3 = 12. */
  test('EXIT subtrai do estoque', async () => {
    await movement(adminToken, { type: 'ENTRY', quantity: 5, productId }); // 10 -> 15
    const response = await movement(adminToken, { type: 'EXIT', quantity: 3, productId }); // 15 -> 12

    assert.equal(response.status, 201);
    assert.equal(response.body.data.product.stockQuantity, 12);
  });

  /**
   * REGRA 2: nao pode sair mais do que existe.
   * O produto tem 10 unidades; pedimos 11.
   */
  test('recusa saida maior que o estoque disponivel', async () => {
    const response = await movement(adminToken, { type: 'EXIT', quantity: 11, productId });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /insuficiente/i);
  });

  /**
   * O TESTE QUE PROVA A TRANSACAO.
   *
   * Depois de uma saida recusada, TRES coisas precisam ser verdade ao mesmo
   * tempo: o saldo intacto, nenhuma movimentacao gravada e o total de registros
   * inalterado. Se a transacao nao existisse - ou se o INSERT acontecesse antes
   * do UPDATE - sobraria um movimento orfao no historico, apontando uma saida que
   * nunca saiu.
   */
  test('saida recusada nao deixa rastro: nem saldo alterado, nem movimento gravado', async () => {
    const antes = await prisma.stockMovement.count();

    await movement(adminToken, { type: 'EXIT', quantity: 999, productId });

    const produto = await prisma.product.findUnique({ where: { id: productId } });
    const depois = await prisma.stockMovement.count();

    assert.equal(produto.stockQuantity, 10, 'o saldo nao pode mudar');
    assert.equal(depois, antes, 'nenhuma movimentacao pode ter sido gravada');
  });

  /** Sair exatamente todo o estoque e valido - o limite e `>=`, nao `>`. */
  test('permite zerar o estoque', async () => {
    const response = await movement(adminToken, { type: 'EXIT', quantity: 10, productId });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.product.stockQuantity, 0);
  });
});

describe('POST /api/movements - validacao', () => {
  /** REGRA 3: quantidade tem que ser maior que zero. */
  test('recusa quantidade zero', async () => {
    const response = await movement(adminToken, { type: 'ENTRY', quantity: 0, productId });
    assert.equal(response.status, 422);
  });

  /**
   * Quantidade negativa e a tentativa mais perigosa: um `EXIT -5` viraria uma
   * ENTRADA disfarcada, furando toda a checagem de estoque suficiente.
   */
  test('recusa quantidade negativa', async () => {
    const response = await movement(adminToken, { type: 'EXIT', quantity: -5, productId });
    assert.equal(response.status, 422);
  });

  test('recusa quantidade fracionada', async () => {
    const response = await movement(adminToken, { type: 'ENTRY', quantity: 2.5, productId });
    assert.equal(response.status, 422);
  });

  test('recusa tipo de movimentacao invalido', async () => {
    const response = await movement(adminToken, { type: 'DEVOLUCAO', quantity: 1, productId });
    assert.equal(response.status, 422);
  });

  test('recusa produto inexistente com 404', async () => {
    const response = await movement(adminToken, { type: 'ENTRY', quantity: 1, productId: 9999 });
    assert.equal(response.status, 404);
  });

  test('recusa movimentacao em produto desativado', async () => {
    await request(app)
      .delete(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const response = await movement(adminToken, { type: 'ENTRY', quantity: 1, productId });
    assert.equal(response.status, 409);
  });

  test('exige autenticacao', async () => {
    const response = await request(app)
      .post('/api/movements')
      .send({ type: 'ENTRY', quantity: 1, productId });

    assert.equal(response.status, 401);
  });
});

describe('Concorrencia', () => {
  /**
   * ===================================================================
   * O TESTE MAIS IMPORTANTE DO PROJETO INTEIRO.
   * ===================================================================
   *
   * Dez requisicoes SIMULTANEAS tirando 1 unidade de um estoque de 10... e depois
   * mais dez, com o estoque ja zerado.
   *
   * Uma implementacao ingenua - ler o saldo, comparar em JavaScript, gravar o
   * resultado - passa em todos os testes anteriores e FALHA aqui: varias
   * requisicoes leem o mesmo valor antes de qualquer escrita, todas aprovam a
   * saida, e o estoque termina negativo.
   *
   * O que faz este teste passar e a verificacao morar DENTRO da escrita:
   *
   *   UPDATE products SET stock_quantity = stock_quantity - 1
   *    WHERE id = $1 AND stock_quantity >= 1
   *
   * O Postgres bloqueia a linha durante o UPDATE, entao as requisicoes entram em
   * fila e cada uma reavalia a condicao com o saldo ja atualizado pela anterior.
   *
   * As duas invariantes verificadas abaixo:
   *   1. o estoque NUNCA fica negativo;
   *   2. o numero de saidas bem-sucedidas e exatamente igual ao estoque que
   *      existia - nem uma a mais.
   */
  test('20 saidas simultaneas de um estoque de 10: exatamente 10 passam', async () => {
    const tentativas = Array.from({ length: 20 }, () =>
      movement(employeeToken, { type: 'EXIT', quantity: 1, productId }),
    );

    const respostas = await Promise.all(tentativas);

    const sucessos = respostas.filter((r) => r.status === 201).length;
    const recusas = respostas.filter((r) => r.status === 400).length;

    const produto = await prisma.product.findUnique({ where: { id: productId } });
    const movimentos = await prisma.stockMovement.count({
      where: { productId, type: 'EXIT' },
    });

    assert.equal(sucessos, 10, 'so podem passar tantas saidas quanto havia estoque');
    assert.equal(recusas, 10);
    assert.equal(produto.stockQuantity, 0, 'o estoque nunca pode ficar negativo');
    assert.equal(movimentos, 10, 'o historico precisa bater com o saldo');
  });

  /**
   * A outra metade da invariante: entradas simultaneas nao podem se perder.
   *
   * Aqui o risco e o oposto - "lost update". Se duas requisicoes lessem 10 e
   * ambas gravassem 11, uma entrada sumiria. Como o SQL gerado e
   * `stock_quantity = stock_quantity + N`, a conta acontece no banco, sobre o
   * valor atual, e nenhuma se perde.
   */
  test('10 entradas simultaneas somam todas', async () => {
    const tentativas = Array.from({ length: 10 }, () =>
      movement(employeeToken, { type: 'ENTRY', quantity: 5, productId }),
    );

    await Promise.all(tentativas);

    const produto = await prisma.product.findUnique({ where: { id: productId } });
    assert.equal(produto.stockQuantity, 10 + 50);
  });
});

describe('GET /api/movements', () => {
  test('lista o historico com produto e autor', async () => {
    await movement(adminToken, { type: 'ENTRY', quantity: 5, productId });
    await movement(employeeToken, { type: 'EXIT', quantity: 2, productId });

    const response = await request(app)
      .get('/api/movements')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.status, 200);
    // 3 movimentos: a entrada inicial do cadastro + as duas acima.
    assert.equal(response.body.meta.total, 3);
    assert.ok(response.body.data[0].product.sku);
    assert.ok(response.body.data[0].user.name);
  });

  test('filtra por tipo', async () => {
    await movement(adminToken, { type: 'EXIT', quantity: 2, productId });

    const response = await request(app)
      .get('/api/movements?type=EXIT')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].type, 'EXIT');
  });

  test('historico por produto', async () => {
    await movement(adminToken, { type: 'ENTRY', quantity: 5, productId });

    const response = await request(app)
      .get(`/api/products/${productId}/movements`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.meta.total, 2);
  });

  /**
   * Movimentacao e imutavel: nao existe rota para editar nem apagar.
   * Este teste congela essa decisao de projeto - se alguem adicionar as rotas
   * "por conveniencia", a suite avisa.
   */
  test('nao existe rota para editar ou apagar movimentacao', async () => {
    const patch = await request(app)
      .patch('/api/movements/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 1 });

    const del = await request(app)
      .delete('/api/movements/1')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(patch.status, 404);
    assert.equal(del.status, 404);
  });
});

describe('GET /api/dashboard/summary', () => {
  test('devolve totais coerentes com o estoque', async () => {
    await movement(adminToken, { type: 'ENTRY', quantity: 10, productId }); // 10 -> 20
    await movement(employeeToken, { type: 'EXIT', quantity: 4, productId }); // 20 -> 16

    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.totals.products, 1);
    assert.equal(response.body.data.totals.unitsInStock, 16);
    // 16 unidades a 79.90
    assert.equal(response.body.data.totals.stockValue, 1278.4);
    // 2 entradas (a do cadastro + a de agora) e 1 saida
    assert.equal(response.body.data.movements.entries.count, 2);
    assert.equal(response.body.data.movements.exits.count, 1);
    assert.equal(response.body.data.movements.exits.units, 4);
  });

  test('conta produtos com estoque baixo', async () => {
    // minimo 5, saldo 10 -> tira 6 e o produto entra em estoque baixo
    await movement(adminToken, { type: 'EXIT', quantity: 6, productId });

    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(response.body.data.totals.lowStock, 1);
    assert.equal(response.body.data.lowStockProducts.length, 1);
  });
});
