/**
 * ===========================================================================
 * MOVIMENTACOES DE ESTOQUE - o coracao do sistema.
 * ===========================================================================
 *
 * Este arquivo e a UNICA porta de escrita de `product.stockQuantity` em todo o
 * projeto. Se o saldo mudou, foi por aqui, e existe uma linha em
 * `stock_movements` explicando por que.
 *
 * ---------------------------------------------------------------------------
 * PROBLEMA 1: ATOMICIDADE (o "A" de ACID)
 * ---------------------------------------------------------------------------
 * Registrar uma saida sao duas escritas:
 *
 *   1. INSERT em stock_movements   (o registro do fato)
 *   2. UPDATE em products          (o saldo)
 *
 * Sem transacao, elas sao independentes. Se a primeira funciona e a segunda
 * falha - queda de conexao, o processo do Node e morto, um deploy no meio, o
 * disco enche - o banco fica MENTINDO: existe uma saida de 3 unidades registrada
 * que nunca foi descontada do saldo. Ninguem percebe ate o inventario, e ai nao
 * ha como saber quais registros ficaram pela metade.
 *
 * A transacao resolve transformando as duas escritas em UMA operacao indivisivel:
 *
 *   BEGIN  ->  as duas escritas  ->  COMMIT (grava as duas)
 *                     |
 *                  qualquer erro  ->  ROLLBACK (desfaz as duas)
 *
 * No Prisma, `prisma.$transaction(async (tx) => { ... })` faz isso. Detalhe que
 * importa: dentro do callback usamos `tx`, e nao `prisma`. Uma chamada feita com
 * `prisma` la dentro sairia POR FORA da transacao e nao seria desfeita pelo
 * rollback - e um erro dificil de enxergar depois.
 *
 * ---------------------------------------------------------------------------
 * PROBLEMA 2: CONCORRENCIA (o que quase todo projeto de portfolio erra)
 * ---------------------------------------------------------------------------
 * A sequencia intuitiva seria:
 *
 *   1. le o estoque             -> 10
 *   2. verifica se da           -> 10 >= 8, ok
 *   3. grava o novo saldo       -> 10 - 8 = 2
 *
 * Agora imagine duas requisicoes simultaneas, cada uma pedindo 8 unidades:
 *
 *   Requisicao A: le 10
 *   Requisicao B: le 10          <- ainda nao houve escrita nenhuma
 *   Requisicao A: 10 >= 8, ok
 *   Requisicao B: 10 >= 8, ok    <- decide com um numero ja desatualizado
 *   Requisicao A: grava 2
 *   Requisicao B: grava 2        <- deveria ser -6, e sobrescreve A
 *
 * Saiu 16 unidades de um estoque de 10, e o sistema registra saldo 2. Isso e uma
 * RACE CONDITION - e repare que a transacao SOZINHA, no nivel de isolamento
 * padrao do PostgreSQL (READ COMMITTED), NAO impede esse cenario. Transacao
 * garante "tudo ou nada"; nao garante que ninguem mexeu no meio do caminho.
 *
 * A SOLUCAO usada aqui: a verificacao vai JUNTO com a escrita, numa unica
 * instrucao atomica:
 *
 *   UPDATE products
 *      SET stock_quantity = stock_quantity - 8
 *    WHERE id = 1 AND stock_quantity >= 8;
 *
 * Duas propriedades salvam a operacao:
 *   * `stock_quantity - 8` e calculado PELO BANCO, sobre o valor atual da linha
 *     no instante da escrita - nao sobre um numero que lemos ha 50ms.
 *   * o `WHERE` e avaliado no momento do UPDATE. O Postgres bloqueia a linha ao
 *     atualizar, entao a segunda requisicao espera a primeira terminar, reavalia
 *     a condicao com o saldo ja atualizado (2 >= 8 e falso) e NAO atualiza nada.
 *
 * O banco informa quantas linhas foram afetadas. `count === 0` significa "a
 * condicao nao valia mais": e assim que descobrimos que faltou estoque, com uma
 * resposta baseada no estado real e nao numa leitura antiga.
 *
 * Como o INSERT do movimento so acontece depois desse UPDATE, dentro da mesma
 * transacao, e impossivel existir movimentacao registrada sem o saldo
 * correspondente.
 *
 * ALTERNATIVAS, e por que nao foram escolhidas:
 *   * `SELECT ... FOR UPDATE` (lock pessimista): funciona, mas e uma ida a mais
 *     ao banco e segura a linha por mais tempo.
 *   * `isolationLevel: 'Serializable'`: o banco detecta o conflito e aborta uma
 *     das transacoes - o que obriga a implementar repeticao automatica no
 *     codigo. E correto, e mais caro, e desnecessario quando o UPDATE
 *     condicional ja resolve.
 */
import { prisma } from '../config/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../errors/AppError.js';
import { buildPagination, buildMeta } from '../utils/pagination.js';
import { serializeMovement, serializeProduct } from '../utils/serialize.js';
import { MOVEMENT_TYPES } from '../constants/index.js';

/**
 * Registra uma entrada ou saida.
 *
 * @param {{ type: 'ENTRY'|'EXIT', quantity: number, productId: number }} input
 * @param {number} userId - vem do JWT, NUNCA do corpo da requisicao
 */
export async function create({ type, quantity, productId }, userId) {
  const isExit = type === MOVEMENT_TYPES.EXIT;

  return prisma.$transaction(async (tx) => {
    // --- 1. O produto existe e esta ativo? --------------------------------
    // Esta leitura NAO e a verificacao de estoque - ela existe para produzir
    // mensagens de erro decentes ("Produto nao encontrado" em vez de um 400
    // generico) e para saber o saldo atual a ser citado na mensagem de falta.
    // A decisao de verdade acontece no passo 2.
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, sku: true, isActive: true, stockQuantity: true },
    });

    if (!product) throw new NotFoundError('Produto');

    if (!product.isActive) {
      throw new ConflictError(
        `O produto "${product.name}" esta desativado e nao aceita movimentacoes.`,
      );
    }

    // --- 2. ATUALIZA O SALDO, com a regra dentro da propria escrita ---------
    // `updateMany` (e nao `update`) de proposito: precisamos de um `where`
    // composto - id E saldo suficiente - e do numero de linhas afetadas.
    // `update` lancaria P2025 sem distinguir "produto sumiu" de "faltou estoque".
    const where = { id: productId, isActive: true };
    if (isExit) {
      // A condicao que impede estoque negativo. Avaliada pelo banco, no momento
      // da escrita, com a linha travada.
      where.stockQuantity = { gte: quantity };
    }

    const updated = await tx.product.updateMany({
      where,
      // increment/decrement viram `stock_quantity = stock_quantity +/- N` no SQL.
      // Fundamental: a conta e feita sobre o valor ATUAL da linha, e nao sobre o
      // que lemos no passo 1.
      data: {
        stockQuantity: isExit ? { decrement: quantity } : { increment: quantity },
      },
    });

    if (updated.count === 0) {
      // Nenhuma linha satisfez o `where`. Como ja confirmamos que o produto
      // existe e esta ativo, so resta uma causa: o saldo nao cobre a saida.
      throw new BadRequestError(
        `Estoque insuficiente para "${product.name}" (${product.sku}). ` +
          `Disponivel: ${product.stockQuantity}, solicitado: ${quantity}.`,
      );
    }

    // --- 3. Registra o fato no historico ----------------------------------
    const movement = await tx.stockMovement.create({
      data: { type, quantity, productId, userId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        user: { select: { id: true, name: true } },
      },
    });

    // Devolver o saldo resultante evita que o frontend precise de uma segunda
    // requisicao so para atualizar o numero na tela.
    const productAfter = await tx.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });

    return {
      movement: serializeMovement(movement),
      product: serializeProduct(productAfter),
    };
  });
}

/**
 * Historico com filtros e paginacao.
 *
 * Ordenado por data decrescente por padrao: em um livro-razao, o que interessa
 * primeiro e o que aconteceu por ultimo.
 */
export async function list(query) {
  const { page, limit, skip, take } = buildPagination(query);

  const where = {};
  if (query.type) where.type = query.type;
  if (query.productId) where.productId = query.productId;
  if (query.userId) where.userId = query.userId;

  // Periodo. `gte`/`lte` montam o BETWEEN. Cada ponta e opcional: da para pedir
  // so "a partir de" ou so "ate".
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = query.from;
    if (query.to) where.createdAt.lte = query.to;
  }

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      skip,
      take,
      orderBy: { [query.sort]: query.order },
      // `include` traz produto e autor na MESMA consulta (via JOIN). Sem isso,
      // montar a tela exigiria uma consulta por linha do historico - o problema
      // N+1: 10 movimentacoes viram 21 consultas.
      include: {
        product: { select: { id: true, name: true, sku: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    data: movements.map(serializeMovement),
    meta: buildMeta({ page, limit, total }),
  };
}

/**
 * Historico de UM produto - atende `GET /api/products/:id/movements`.
 *
 * A URL aninhada existe porque descreve exatamente o recurso pedido: "as
 * movimentacoes DESTE produto". Ja a CRIACAO fica em `POST /api/movements`, e
 * nao aninhada: assim existe um unico ponto de escrita de estoque no sistema
 * inteiro, mais facil de auditar, testar e proteger.
 */
export async function listByProduct(productId, query) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError('Produto');

  return list({ ...query, productId });
}
