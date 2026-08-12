import * as dashboardService from '../services/dashboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/httpResponse.js';

/**
 * Um endpoint so para a tela inteira do dashboard.
 *
 * A alternativa seria o frontend fazer seis chamadas (total de produtos, estoque
 * baixo, entradas, saidas, valor, ultimas movimentacoes). Juntar tudo aqui
 * significa uma unica ida a rede, um unico momento no tempo - e portanto numeros
 * COERENTES ENTRE SI. Com seis chamadas, uma movimentacao registrada no meio do
 * caminho faria a tela mostrar um total que nao bate com a lista logo abaixo.
 */
export const summary = asyncHandler(async (_req, res) => {
  const data = await dashboardService.getSummary();
  return ok(res, data);
});
