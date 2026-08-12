import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';

const router = Router();

/**
 * RATE LIMIT nas rotas de autenticacao.
 *
 * Sem ele, um script tenta 10.000 senhas por minuto contra o mesmo email ate
 * acertar. O bcrypt torna cada tentativa lenta, o que ja atrapalha muito o
 * atacante - mas o rate limit ataca o problema por outro lado: limita o NUMERO
 * de tentativas por IP, independentemente de quanto cada uma custa.
 *
 * Repare que ele fica so aqui, e nao na API inteira: e nas rotas de credencial
 * que a forca bruta compensa. Aplicar o mesmo limite a `GET /products`
 * atrapalharia o uso normal do sistema.
 *
 * LIMITE HONESTO DESTA IMPLEMENTACAO: a contagem fica na MEMORIA do processo.
 * Com duas instancias da API rodando, cada uma tem seu proprio contador, e
 * reiniciar o servidor zera tudo. Em producao com varias instancias, o
 * armazenamento precisaria ser compartilhado (Redis).
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // por IP, por janela
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.',
  },
});

// A ORDEM dos middlewares na rota e a propria historia da requisicao:
// limita tentativas -> valida o formato -> so entao chega ao controller.
router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);

// Rota protegida: sem token valido, nao passa do `authenticate`.
router.get('/me', authenticate, authController.me);

export default router;
