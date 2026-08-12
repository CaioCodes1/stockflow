import * as categoryService from '../services/category.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/httpResponse.js';

export const list = asyncHandler(async (_req, res) => {
  const categories = await categoryService.list();
  return ok(res, categories);
});

export const create = asyncHandler(async (req, res) => {
  const category = await categoryService.create(req.body);
  return created(res, category, 'Categoria criada com sucesso');
});
