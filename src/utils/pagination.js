import { PAGINATION } from '../constants/index.js';

/**
 * Traduz `page`/`limit` para o vocabulario do banco (`skip`/`take`).
 *
 * O Postgres nao conhece "pagina 3": ele entende `OFFSET 20 LIMIT 10`. A conta
 * que faz a ponte e sempre a mesma:
 *
 *   skip = (page - 1) * limit
 *
 *   pagina 1, limite 10 -> pula 0,  pega 10   (itens 1 a 10)
 *   pagina 2, limite 10 -> pula 10, pega 10   (itens 11 a 20)
 *
 * Os valores ja chegam aqui validados e convertidos pelo Zod; o `Math.max` e
 * cinto de seguranca para o caso de esta funcao ser chamada de outro lugar.
 */
export function buildPagination({ page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT } = {}) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), PAGINATION.MAX_LIMIT);

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}

/**
 * Monta o bloco `meta` que acompanha toda listagem paginada.
 *
 * Por que devolver isto em vez de so o array? Porque sem `total` o frontend nao
 * consegue desenhar a paginacao - ele nao tem como saber se existe proxima
 * pagina antes de pedir e receber vazio.
 *
 * DETALHE QUE PEGA MUITA GENTE: o `total` precisa vir de um COUNT com o MESMO
 * filtro da consulta principal. Contar a tabela inteira enquanto a listagem esta
 * filtrada faz o `totalPages` mentir, e o usuario acaba em paginas vazias.
 */
export function buildMeta({ page, limit, total }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}
