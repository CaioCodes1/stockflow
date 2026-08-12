/**
 * Valores fixos usados em mais de um lugar.
 *
 * Por que nao escrever `'ADMIN'` direto onde precisa? Porque string solta pelo
 * codigo e um erro de digitacao esperando para acontecer: `'ADIMN'` nao quebra
 * nada na hora, so faz a verificacao de permissao falhar silenciosamente. Com a
 * constante, `ROLES.ADIMN` e `undefined` e o problema aparece na primeira
 * execucao.
 */

export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
});

export const MOVEMENT_TYPES = Object.freeze({
  ENTRY: 'ENTRY',
  EXIT: 'EXIT',
});

export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  // Teto de seguranca: sem ele, `?limit=999999999` deixaria qualquer visitante
  // derrubar o banco com uma unica requisicao.
  MAX_LIMIT: 100,
});

/**
 * LISTA BRANCA de colunas pelas quais e permitido ordenar.
 *
 * O nome da coluna vem da query string (`?sort=price`). Mesmo com o Prisma - que
 * ja protege contra injection nos VALORES - deixar o cliente escolher livremente
 * o campo de ordenacao expoe a estrutura interna e permite ordenar por colunas
 * que nao deveriam ser publicas. Lista branca: o que nao esta aqui nao existe.
 */
export const PRODUCT_SORTABLE_FIELDS = Object.freeze([
  'name',
  'sku',
  'price',
  'stockQuantity',
  'createdAt',
  'updatedAt',
]);

export const MOVEMENT_SORTABLE_FIELDS = Object.freeze(['createdAt', 'quantity']);
