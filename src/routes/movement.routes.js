import { Router } from 'express';

import * as movementController from '../controllers/movement.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { createMovementSchema, listMovementsQuerySchema } from '../validators/movement.validator.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listMovementsQuerySchema }), movementController.list);

/**
 * Registrar movimentacao e permitido para AMBOS os papeis - e proposital.
 *
 * Quem esta no estoque, recebendo mercadoria e separando pedido, e o funcionario.
 * Se so o ADMIN pudesse registrar, o sistema seria contornado na pratica: as
 * pessoas anotariam num papel para lancar depois, e o saldo em tela nunca
 * corresponderia a prateleira. Um controle que atrapalha o trabalho e um controle
 * que ninguem usa.
 *
 * O que protege o sistema nao e proibir o funcionario de movimentar, e sim
 * REGISTRAR QUEM MOVIMENTOU - a auditoria substitui a restricao.
 */
router.post('/', validate({ body: createMovementSchema }), movementController.create);

/**
 * NAO EXISTE PATCH NEM DELETE AQUI, e essa ausencia e uma decisao de projeto.
 *
 * Movimentacao e um FATO CONSUMADO, como um lancamento contabil. Editar uma
 * saida de 5 para 3 significaria reescrever o passado: o saldo mudaria sem que
 * ninguem soubesse por que, e a auditoria - a razao de a tabela existir - viraria
 * ficcao.
 *
 * Errou? Registra a movimentacao contraria. E como o mundo real funciona:
 * contabilidade faz estorno, nao usa borracha.
 */

export default router;
