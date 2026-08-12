/**
 * Categorias.
 *
 * O recurso mais simples do sistema - e por isso um bom lugar para ver a pilha
 * inteira (rota -> validacao -> controller -> service -> Prisma) sem barulho.
 */
import { prisma } from '../config/prisma.js';

/**
 * Lista com a CONTAGEM de produtos de cada categoria.
 *
 * `_count` faz o Prisma gerar um LEFT JOIN com agregacao numa unica consulta.
 * A alternativa ingenua seria buscar as categorias e, para cada uma, contar os
 * produtos - o problema N+1: 1 consulta para a lista mais N consultas, uma por
 * item. Com 4 categorias ninguem nota; com 400, a pagina trava.
 */
export async function list() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    productCount: category._count.products,
    createdAt: category.createdAt,
  }));
}

/**
 * Criacao. A unicidade do nome e garantida pelo indice UNIQUE do banco - o erro
 * P2002 vira 409 no errorHandler, sem precisarmos de um `findFirst` antes.
 */
export async function create({ name }) {
  return prisma.category.create({ data: { name } });
}
