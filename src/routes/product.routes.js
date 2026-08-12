import { Router } from 'express';

import * as productController from '../controllers/product.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from '../validators/product.validator.js';
import { listMovementsQuerySchema } from '../validators/movement.validator.js';
import { ROLES } from '../constants/index.js';

const router = Router();

router.use(authenticate);

// --- Leitura: ADMIN e EMPLOYEE ---------------------------------------------
router.get('/', validate({ query: listProductsQuerySchema }), productController.list);

router.get('/:id', validate({ params: idParamSchema }), productController.findById);

/**
 * Historico de um produto.
 *
 * A URL ANINHADA descreve exatamente o recurso pedido: "as movimentacoes DESTE
 * produto". Ja a criacao vive em `POST /api/movements` - assim existe um unico
 * ponto de escrita de estoque no sistema, mais facil de auditar e testar.
 *
 * Aqui validamos params E query ao mesmo tempo: o id da URL e os filtros de
 * paginacao.
 */
router.get(
  '/:id/movements',
  validate({ params: idParamSchema, query: listMovementsQuerySchema }),
  productController.listMovements,
);

// --- Escrita: somente ADMIN -------------------------------------------------
// EMPLOYEE movimenta o estoque, mas nao decide o catalogo: nao cria, nao edita
// e nao remove produtos.
router.post(
  '/',
  authorize(ROLES.ADMIN),
  validate({ body: createProductSchema }),
  productController.create,
);

router.patch(
  '/:id',
  authorize(ROLES.ADMIN),
  validate({ params: idParamSchema, body: updateProductSchema }),
  productController.update,
);

router.delete(
  '/:id',
  authorize(ROLES.ADMIN),
  validate({ params: idParamSchema }),
  productController.remove,
);

export default router;
