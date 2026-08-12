/**
 * TESTES UNITARIOS - funcoes puras, sem banco e sem HTTP.
 *
 * Rodam em milissegundos porque nao dependem de nada externo. E a diferenca
 * pratica entre teste unitario e de integracao: aqui verificamos uma CONTA;
 * nos outros arquivos verificamos o COMPORTAMENTO do sistema inteiro.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildPagination, buildMeta } from '../../src/utils/pagination.js';

describe('buildPagination', () => {
  // A traducao "pagina" -> "offset" e a linha mais facil de errar em paginacao.
  test('converte pagina e limite em skip e take', () => {
    assert.deepEqual(buildPagination({ page: 1, limit: 10 }), {
      page: 1,
      limit: 10,
      skip: 0,
      take: 10,
    });

    assert.deepEqual(buildPagination({ page: 3, limit: 20 }), {
      page: 3,
      limit: 20,
      skip: 40, // (3 - 1) * 20
      take: 20,
    });
  });

  test('aplica valores padrao quando nada e informado', () => {
    const result = buildPagination();
    assert.equal(result.page, 1);
    assert.equal(result.limit, 10);
    assert.equal(result.skip, 0);
  });

  // O teto protege o banco de um `?limit=999999`.
  test('prende o limite ao teto maximo', () => {
    assert.equal(buildPagination({ page: 1, limit: 99999 }).take, 100);
  });

  test('nao aceita pagina menor que 1', () => {
    assert.equal(buildPagination({ page: -5, limit: 10 }).skip, 0);
  });
});

describe('buildMeta', () => {
  test('calcula o total de paginas arredondando para cima', () => {
    // 25 itens em paginas de 10 = 3 paginas (a ultima com 5).
    const meta = buildMeta({ page: 1, limit: 10, total: 25 });
    assert.equal(meta.totalPages, 3);
  });

  test('indica corretamente a existencia de proxima e anterior', () => {
    const primeira = buildMeta({ page: 1, limit: 10, total: 25 });
    assert.equal(primeira.hasPreviousPage, false);
    assert.equal(primeira.hasNextPage, true);

    const ultima = buildMeta({ page: 3, limit: 10, total: 25 });
    assert.equal(ultima.hasPreviousPage, true);
    assert.equal(ultima.hasNextPage, false);
  });

  // Caso de borda que costuma virar divisao estranha ou NaN na tela.
  test('lida com resultado vazio', () => {
    const meta = buildMeta({ page: 1, limit: 10, total: 0 });
    assert.equal(meta.totalPages, 0);
    assert.equal(meta.hasNextPage, false);
  });
});
