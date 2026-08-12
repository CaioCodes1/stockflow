import * as productService from '../services/product.service.js';
import * as movementService from '../services/movement.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent } from '../utils/httpResponse.js';

export const list = asyncHandler(async (req, res) => {
  // `req.validatedQuery` (e nao `req.query`) porque o middleware de validacao ja
  // converteu os tipos: aqui `page` e numero, `lowStock` e boolean de verdade.
  const { data, meta } = await productService.list(req.validatedQuery);
  return ok(res, data, null, meta);
});

export const findById = asyncHandler(async (req, res) => {
  const product = await productService.findById(req.params.id);
  return ok(res, product);
});

export const create = asyncHandler(async (req, res) => {
  // O autor do estoque inicial vem do token, nunca do corpo.
  const product = await productService.create(req.body, req.user.id);
  return created(res, product, 'Produto criado com sucesso');
});

export const update = asyncHandler(async (req, res) => {
  const product = await productService.update(req.params.id, req.body);
  return ok(res, product, 'Produto atualizado com sucesso');
});

/**
 * 204 No Content: sucesso sem corpo. Nao ha o que devolver depois de remover -
 * e devolver o objeto "removido" so confundiria quem consome a API.
 */
export const remove = asyncHandler(async (req, res) => {
  await productService.remove(req.params.id);
  return noContent(res);
});

/** Historico de um produto: GET /api/products/:id/movements */
export const listMovements = asyncHandler(async (req, res) => {
  const { data, meta } = await movementService.listByProduct(req.params.id, req.validatedQuery);
  return ok(res, data, null, meta);
});
