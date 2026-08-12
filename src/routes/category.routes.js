import { Router } from 'express';

import * as categoryController from '../controllers/category.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { createCategorySchema } from '../validators/category.validator.js';
import { ROLES } from '../constants/index.js';

const router = Router();

// Aplica-se a TODAS as rotas abaixo: nenhuma categoria e publica.
// Registrar uma vez evita o esquecimento de repetir `authenticate` em cada rota
// nova - e um esquecimento desses e um endpoint aberto para a internet.
router.use(authenticate);

// Qualquer usuario autenticado pode LER (precisa disso para cadastrar produto).
router.get('/', categoryController.list);

// Somente ADMIN cria. A taxonomia do estoque e decisao de gestao.
router.post('/', authorize(ROLES.ADMIN), validate({ body: createCategorySchema }), categoryController.create);

export default router;
