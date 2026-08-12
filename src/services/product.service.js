/**
 * Produtos.
 *
 * A regra mais importante deste arquivo e uma AUSENCIA: nenhuma funcao aqui
 * escreve em `stockQuantity`. O saldo so muda em movement.service.js, dentro de
 * uma transacao. Se um dia alguem adicionar um `stockQuantity` ao `update`
 * abaixo, o historico e o saldo passam a poder divergir - e o sistema perde a
 * unica coisa que ele promete garantir.
 *
 * A unica excecao aparente e o `create` com estoque inicial, e ela existe
 * justamente para NAO abrir excecao: o produto so nasce com saldo se nascer
 * junto com a movimentacao de entrada que o explica.
 */
import { prisma } from '../config/prisma.js';
import { NotFoundError, ConflictError } from '../errors/AppError.js';
import { buildPagination, buildMeta } from '../utils/pagination.js';
import { serializeProduct } from '../utils/serialize.js';
import { MOVEMENT_TYPES } from '../constants/index.js';

/**
 * Monta o `where` do Prisma a partir dos filtros ja validados.
 *
 * COMO OS PARAMETROS DA URL VIRAM UMA CONSULTA:
 *
 *   ?search=mouse&category=2&lowStock=true
 *        |            |            |
 *        v            v            v
 *   OR[name, sku]  categoryId   stockQuantity <= minimumStock
 *
 * Cada filtro e opcional e apenas SOMA uma condicao ao objeto. Como o Prisma
 * combina as chaves de `where` com AND, nao precisamos de um `if` para cada
 * combinacao possivel - sao 2^4 combinacoes com quatro filtros, e todas
 * funcionam sem codigo especifico.
 */
function buildWhere({ search, category, lowStock, includeInactive }) {
  const where = {};

  // Produtos desativados ficam fora por padrao - soft delete so faz sentido se o
  // registro realmente sumir das listagens.
  if (!includeInactive) where.isActive = true;

  if (search) {
    // OR: casa em nome OU sku. `mode: 'insensitive'` gera ILIKE no Postgres,
    // entao "mouse", "Mouse" e "MOUSE" encontram a mesma coisa.
    //
    // LIMITE HONESTO: `contains` vira `ILIKE '%mouse%'`. O curinga a esquerda
    // impede o uso de indice B-tree, entao a busca varre a tabela. Com milhares
    // de produtos isso pesa, e a solucao seria busca textual do Postgres
    // (pg_trgm ou tsvector). Para o volume de um MVP, e a escolha certa: simples
    // e suficiente.
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (category) where.categoryId = category;

  if (lowStock !== undefined) {
    /**
     * Comparar DUAS COLUNAS DA MESMA LINHA (`stock_quantity <= minimum_stock`)
     * e diferente de comparar coluna com valor. `prisma.product.fields` existe
     * exatamente para isso: gera a referencia de campo no SQL em vez de tratar o
     * outro lado como parametro.
     *
     * Sem esse recurso, a alternativa seria `$queryRaw` - o que custaria a
     * composicao com os demais filtros e obrigaria a montar SQL na mao.
     */
    where.stockQuantity = lowStock
      ? { lte: prisma.product.fields.minimumStock }
      : { gt: prisma.product.fields.minimumStock };
  }

  return where;
}

/**
 * Listagem paginada.
 *
 * As duas consultas (pagina e total) rodam em PARALELO com `Promise.all`: sao
 * independentes, entao esperar uma para so entao disparar a outra dobraria o
 * tempo de resposta a troco de nada.
 *
 * O `where` e RIGOROSAMENTE O MESMO nas duas. Contar a tabela inteira enquanto a
 * listagem esta filtrada faz o `totalPages` mentir e joga o usuario em paginas
 * vazias - erro classico em paginacao.
 */
export async function list(query) {
  const { page, limit, skip, take } = buildPagination(query);
  const where = buildWhere(query);

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take,
      // `sort` ja foi validado contra uma lista branca no schema Zod: o cliente
      // nao consegue ordenar por uma coluna arbitraria.
      orderBy: { [query.sort]: query.order },
      include: { category: true },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: products.map(serializeProduct),
    meta: buildMeta({ page, limit, total }),
  };
}

export async function findById(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });

  if (!product) throw new NotFoundError('Produto');
  return serializeProduct(product);
}

/**
 * Criacao.
 *
 * Roda inteira dentro de uma transacao porque, quando ha estoque inicial, sao
 * duas escritas que precisam ser tratadas como uma so: o produto e a entrada que
 * justifica o saldo dele.
 */
export async function create({ initialStock = 0, ...data }, userId) {
  return prisma.$transaction(async (tx) => {
    // Checagem explicita apenas para dar uma mensagem boa ("Categoria nao
    // encontrada" em vez de "Referencia invalida"). A GARANTIA de verdade
    // continua sendo a chave estrangeira: mesmo que a categoria seja apagada
    // entre esta linha e o INSERT, o banco recusa - e o P2003 vira 400.
    const category = await tx.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new NotFoundError('Categoria');

    const product = await tx.product.create({
      data: { ...data, stockQuantity: initialStock },
      include: { category: true },
    });

    if (initialStock > 0) {
      await tx.stockMovement.create({
        data: {
          type: MOVEMENT_TYPES.ENTRY,
          quantity: initialStock,
          productId: product.id,
          userId,
        },
      });
    }

    return serializeProduct(product);
  });
}

/**
 * Atualizacao parcial.
 *
 * `stockQuantity` nem chega aqui: o schema Zod recusa o campo antes, com uma
 * mensagem que aponta o caminho correto (`POST /api/movements`).
 */
export async function update(id, data) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Produto');

  if (data.categoryId && data.categoryId !== existing.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new NotFoundError('Categoria');
  }

  const product = await prisma.product.update({
    where: { id },
    data,
    include: { category: true },
  });

  return serializeProduct(product);
}

/**
 * EXCLUSAO LOGICA (soft delete).
 *
 * POR QUE NAO APAGAR DE VERDADE?
 *
 *  1. O historico. Um produto com 40 movimentacoes carrega 40 registros de
 *     auditoria. Apagar a linha significaria apagar tambem esse historico - e a
 *     FK `onDelete: Restrict` nem permitiria, ela recusaria o DELETE.
 *
 *  2. Relatorios do passado. O balanco do mes anterior precisa saber o nome e o
 *     preco do que foi movimentado, mesmo que o item tenha saido de linha.
 *
 *  3. E reversivel. Exclusao por engano se desfaz com um PATCH.
 *
 * O efeito visivel para quem usa o sistema e o mesmo: o produto some das
 * listagens e nao aceita novas movimentacoes. Isso e o que sistemas reais fazem -
 * `DELETE` de verdade e raro fora de dados descartaveis.
 */
export async function remove(id) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundError('Produto');

  if (!product.isActive) {
    throw new ConflictError('Este produto ja esta desativado');
  }

  await prisma.product.update({ where: { id }, data: { isActive: false } });
}

/**
 * Produtos com estoque baixo, ordenados pelos mais criticos.
 *
 * "Mais critico" e a MAIOR DIFERENCA percentual entre o minimo e o saldo? Seria
 * o ideal, mas exigiria ordenar por uma expressao entre colunas. Ordenamos pelo
 * saldo absoluto: quem tem menos unidades aparece primeiro. Simples, previsivel
 * e resolve o problema de quem olha o painel.
 */
export async function findLowStock(limit = 10) {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      stockQuantity: { lte: prisma.product.fields.minimumStock },
    },
    orderBy: { stockQuantity: 'asc' },
    take: limit,
    include: { category: true },
  });

  return products.map(serializeProduct);
}
