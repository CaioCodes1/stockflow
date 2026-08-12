/**
 * Dashboard - numeros agregados do estoque.
 *
 * O que muda de mentalidade aqui: nos outros services buscamos REGISTROS; aqui
 * buscamos RESPOSTAS. "Quanto vale meu estoque?" nao e uma linha da tabela, e
 * uma conta sobre todas elas.
 *
 * REGRA QUE VALE PARA TODO RELATORIO: agregacao se faz NO BANCO.
 * A alternativa - trazer os 5.000 produtos para o Node e somar com `reduce` -
 * transfere megabytes pela rede, ocupa memoria do processo e ainda fica mais
 * lenta, porque o Postgres soma colunas usando indice e trabalhando em C. O
 * banco existe para isso.
 *
 * As consultas sao independentes entre si, entao rodam em PARALELO com
 * `Promise.all`. Em serie seriam ~6 idas ao banco somadas; em paralelo, o tempo
 * da mais lenta.
 */
import { prisma } from '../config/prisma.js';
import { serializeMovement } from '../utils/serialize.js';
import { findLowStock } from './product.service.js';

export async function getSummary() {
  const [totalProducts, lowStockCount, movementTotals, stockValueRows, lowStockProducts, lastMovements, totalUnits] =
    await Promise.all([
      // 1. Quantos produtos ativos existem.
      prisma.product.count({ where: { isActive: true } }),

      // 2. Quantos estao no limite ou abaixo. Comparacao entre duas colunas da
      //    mesma linha - o mesmo recurso de referencia de campo usado no filtro
      //    da listagem, para que "estoque baixo" signifique a MESMA coisa nas
      //    duas telas.
      prisma.product.count({
        where: { isActive: true, stockQuantity: { lte: prisma.product.fields.minimumStock } },
      }),

      /**
       * 3. Entradas e saidas, em UMA consulta.
       *
       * `groupBy` gera `GROUP BY type` com as agregacoes juntas. A alternativa
       * seria quatro consultas (contar entradas, somar entradas, contar saidas,
       * somar saidas); esta traz tudo de uma vez.
       *
       * Devolvemos os dois numeros de cada tipo porque respondem perguntas
       * diferentes: `count` e quantas VEZES houve movimentacao (quanto o estoque
       * e mexido) e `_sum.quantity` e quantas UNIDADES circularam (o volume).
       */
      prisma.stockMovement.groupBy({
        by: ['type'],
        _count: { _all: true },
        _sum: { quantity: true },
      }),

      /**
       * 4. Valor imobilizado: SUM(preco * quantidade).
       *
       * AQUI O ORM NAO ALCANCA. `aggregate` sabe somar UMA coluna; nao sabe
       * multiplicar duas colunas antes de somar. Descemos para SQL - e saber
       * reconhecer esse momento e mais valioso que decorar a API do ORM.
       *
       * `$queryRaw` (template com crase) parametriza automaticamente qualquer
       * valor interpolado. O primo perigoso e `$queryRawUnsafe`, que concatena
       * string crua e reabre a porta para SQL injection. Aqui nao ha entrada do
       * usuario, mas o habito de usar a versao segura e o que evita o acidente
       * no dia em que houver.
       *
       * COALESCE porque SUM de tabela vazia devolve NULL, nao zero - e um
       * dashboard novo mostraria "null" em vez de "R$ 0,00".
       */
      prisma.$queryRaw`
        SELECT COALESCE(SUM(price * stock_quantity), 0) AS total
        FROM products
        WHERE is_active = true
      `,

      // 5. A lista dos produtos criticos (reaproveita a regra do product.service,
      //    em vez de reescrever a consulta com risco de divergir).
      findLowStock(5),

      // 6. Ultimas movimentacoes, com produto e autor no mesmo JOIN.
      prisma.stockMovement.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          user: { select: { id: true, name: true } },
        },
      }),

      // 7. Total de unidades em estoque (soma simples - esta o ORM resolve).
      prisma.product.aggregate({
        where: { isActive: true },
        _sum: { stockQuantity: true },
      }),
    ]);

  // `groupBy` devolve so os tipos que EXISTEM. Num banco sem nenhuma saida, o
  // array nao traz a linha de EXIT - e ler `.find(...)._sum` daria erro. O
  // fallback abaixo garante zero em vez de quebrar.
  const entry = movementTotals.find((row) => row.type === 'ENTRY');
  const exit = movementTotals.find((row) => row.type === 'EXIT');

  // O Postgres devolve NUMERIC como objeto Decimal; `Number()` converte para o
  // JSON. Conversao para exibicao apenas - a conta foi feita no banco, exata.
  const stockValue = Number(stockValueRows[0]?.total ?? 0);

  return {
    totals: {
      products: totalProducts,
      lowStock: lowStockCount,
      unitsInStock: totalUnits._sum.stockQuantity ?? 0,
      // Arredondado para duas casas: e dinheiro, e vai direto para a tela.
      stockValue: Number(stockValue.toFixed(2)),
    },
    movements: {
      entries: { count: entry?._count._all ?? 0, units: entry?._sum.quantity ?? 0 },
      exits: { count: exit?._count._all ?? 0, units: exit?._sum.quantity ?? 0 },
      total: (entry?._count._all ?? 0) + (exit?._count._all ?? 0),
    },
    // Ja vem no formato publico de `findLowStock`.
    lowStockProducts,
    lastMovements: lastMovements.map(serializeMovement),
  };
}
