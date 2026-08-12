/**
 * Controllers sao TRADUTORES, nao donos de regra.
 *
 * A responsabilidade deles cabe em tres linhas:
 *   1. tirar do `req` o que o service precisa;
 *   2. chamar o service;
 *   3. transformar o retorno em resposta HTTP (status + corpo).
 *
 * Se aparecer um `if` de regra de negocio aqui, ele esta no lugar errado - o
 * service e que precisa saber disso, para continuar funcionando fora do HTTP.
 *
 * Repare que nao ha try/catch: o `asyncHandler` encaminha qualquer erro para o
 * errorHandler central.
 */
import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/httpResponse.js';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, result, 'Cadastro realizado com sucesso');
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ok(res, result, 'Login realizado com sucesso');
});

/**
 * `req.user` foi preenchido pelo middleware `authenticate`. O controller nao
 * decodifica token nem consulta banco - quando chega aqui, a identidade ja e um
 * fato estabelecido.
 */
export const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  return ok(res, user);
});
