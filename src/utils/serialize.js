/**
 * Traducao dos objetos do banco para o formato publico da API.
 *
 * POR QUE NAO DEVOLVER O OBJETO DO PRISMA DIRETO?
 *
 *  1. SEGURANCA - o registro de usuario carrega o hash da senha. `res.json(user)`
 *     publicaria esse hash. Uma funcao de serializacao explicita torna o
 *     vazamento impossivel por esquecimento: o que nao esta listado nao sai.
 *
 *  2. TIPO DO PRECO - a coluna e NUMERIC, e o Prisma a entrega como um objeto
 *     `Decimal`, nao como numero. Jogado no JSON ele viraria a string "899.9", o
 *     que obrigaria o frontend a converter em todo lugar. Convertemos aqui, num
 *     ponto so.
 *
 *  3. CAMPOS DERIVADOS - `isLowStock` nao existe no banco: e uma comparacao
 *     entre duas colunas. Calcular no backend garante que a regra e a MESMA em
 *     toda tela que consumir a API. Se cada pagina fizesse a propria conta, uma
 *     usaria `<` e outra `<=`, e os numeros deixariam de bater.
 *
 *  4. ESTABILIDADE DO CONTRATO - renomear uma coluna no banco deixa de quebrar
 *     quem consome a API; basta ajustar a traducao aqui.
 *
 * Sobre o preco virar `Number`: e ponto flutuante, adequado para EXIBIR. Toda
 * conta com dinheiro continua acontecendo no Postgres, em NUMERIC exato.
 */

export function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

export function serializeProduct(product) {
  if (!product) return null;

  const price = Number(product.price);

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    sku: product.sku,
    price,
    stockQuantity: product.stockQuantity,
    minimumStock: product.minimumStock,
    // Campo derivado: a definicao de "estoque baixo" vive em um unico lugar.
    isLowStock: product.stockQuantity <= product.minimumStock,
    // Valor imobilizado neste item. Util no dashboard e nas listagens.
    stockValue: Number((price * product.stockQuantity).toFixed(2)),
    categoryId: product.categoryId,
    category: product.category ? { id: product.category.id, name: product.category.name } : undefined,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function serializeMovement(movement) {
  if (!movement) return null;
  return {
    id: movement.id,
    type: movement.type,
    quantity: movement.quantity,
    productId: movement.productId,
    product: movement.product
      ? { id: movement.product.id, name: movement.product.name, sku: movement.product.sku }
      : undefined,
    userId: movement.userId,
    // So nome e id do autor. Email de funcionario nao precisa circular no
    // historico que todo mundo enxerga.
    user: movement.user ? { id: movement.user.id, name: movement.user.name } : undefined,
    createdAt: movement.createdAt,
  };
}
