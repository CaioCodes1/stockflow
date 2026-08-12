/**
 * Mapa de rotas da API.
 *
 * Um lugar so para ver a superficie inteira do sistema. Cada arquivo cuida de um
 * recurso; este monta os prefixos.
 */
import { Router } from 'express';

import authRoutes from './auth.routes.js';
import categoryRoutes from './category.routes.js';
import productRoutes from './product.routes.js';
import movementRoutes from './movement.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

/**
 * HEALTH CHECK - unica rota publica.
 *
 * Serve para o Docker, para o balanceador de carga e para o monitoramento
 * responderem "a aplicacao esta viva?". Repare que ela CONSULTA O BANCO: uma API
 * que responde 200 mas nao conversa com o Postgres esta morta na pratica, e um
 * health check que so devolve `{ ok: true }` esconderia exatamente isso.
 */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      success: true,
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  }),
);

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/movements', movementRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
