import { Router } from 'express';

import * as dashboardController from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Numeros do negocio nao sao publicos: faturamento imobilizado e volume de
// operacao dizem muito sobre a empresa para quem estiver olhando de fora.
router.use(authenticate);

router.get('/summary', dashboardController.summary);

export default router;
