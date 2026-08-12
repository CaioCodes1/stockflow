import * as movementService from '../services/movement.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/httpResponse.js';

export const list = asyncHandler(async (req, res) => {
  const { data, meta } = await movementService.list(req.validatedQuery);
  return ok(res, data, null, meta);
});

/**
 * A LINHA MAIS IMPORTANTE DESTE ARQUIVO e o segundo argumento: `req.user.id`.
 *
 * O autor da movimentacao vem do TOKEN, nunca do corpo da requisicao. Se viesse
 * do body, qualquer pessoa registraria uma saida em nome de outro funcionario - e
 * o historico, que existe justamente para responder "quem mexeu no estoque",
 * perderia todo o valor.
 */
export const create = asyncHandler(async (req, res) => {
  const result = await movementService.create(req.body, req.user.id);

  const verbo = result.movement.type === 'ENTRY' ? 'Entrada' : 'Saida';
  return created(
    res,
    result,
    `${verbo} registrada. Estoque atual: ${result.product.stockQuantity}.`,
  );
});
