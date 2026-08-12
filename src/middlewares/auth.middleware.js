/**
 * AUTENTICACAO (quem e voce?) e AUTORIZACAO (o que voce pode?).
 *
 * Sao duas responsabilidades distintas e por isso sao dois middlewares.
 * Uma rota as compoe em cadeia:
 *
 *   router.post('/', authenticate, authorize(ROLES.ADMIN), controller.create);
 *                      |- 401 se -|  |- 403 se nao for -|
 *                        sem token         ADMIN
 *
 * Middleware, na pratica, e so uma funcao (req, res, next) que roda ANTES do
 * controller. Ela pode enriquecer o `req`, interromper a cadeia respondendo, ou
 * chamar `next(erro)` para pular direto ao tratador de erros.
 */
import { verifyToken } from '../utils/jwt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { prisma } from '../config/prisma.js';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';

/**
 * Exige um token valido e anexa o usuario a `req.user`.
 *
 * POR QUE CONSULTAR O BANCO SE O TOKEN JA TRAZ id E role?
 * Porque o token e uma FOTOGRAFIA do momento do login. Se o admin rebaixou o
 * usuario de ADMIN para EMPLOYEE ha 10 minutos, ou desativou a conta, o token
 * antigo continua afirmando "ADMIN" ate expirar. A consulta garante que role e
 * isActive refletem o estado ATUAL. Custa um SELECT por chave primaria (barato,
 * usa indice) e fecha uma falha de seguranca real.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError(
      'Token de acesso ausente. Envie o header "Authorization: Bearer <token>".',
    );
  }

  // 'Bearer eyJhbGciOi...' -> tudo depois do primeiro espaco
  const token = header.slice(7).trim();
  if (!token) throw new UnauthorizedError('Token de acesso ausente');

  const payload = verifyToken(token); // lanca 401 se invalido ou expirado

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    // `select` explicito: o hash da senha NUNCA sai do banco sem necessidade.
    // Se ele nao esta em memoria, nao ha como vazar por um log ou um JSON.
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!user) throw new UnauthorizedError('Usuario do token nao existe mais');
  if (!user.isActive) throw new UnauthorizedError('Usuario desativado');

  // A partir daqui, TODO controller pode confiar em req.user.
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
});

/**
 * Restringe a rota a determinados papeis.
 *
 * Repare que `authorize` NAO e um middleware - e uma FABRICA de middlewares. Ela
 * recebe os papeis e RETORNA a funcao (req, res, next). E o que permite escrever
 * `authorize(ROLES.ADMIN)` na definicao da rota. O padrao se chama closure: a
 * funcao devolvida "lembra" do array `allowedRoles` mesmo depois que a fabrica
 * ja terminou de executar.
 *
 * @param {...string} allowedRoles
 */
export function authorize(...allowedRoles) {
  return function authorizeMiddleware(req, _res, next) {
    if (!req.user) {
      // Erro de programacao: alguem esqueceu o `authenticate` antes deste.
      return next(new UnauthorizedError('Rota protegida exige autenticacao'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Acesso restrito a: ${allowedRoles.join(', ')}. Seu perfil: ${req.user.role}.`,
        ),
      );
    }

    next();
  };
}

/**
 * O LIMITE DESTE MIDDLEWARE - vale saber explicar:
 *
 * `authorize` responde apenas "esta ROLE pode acessar esta ROTA?". Ele nao
 * consegue responder "este usuario e dono DESTE registro?", porque isso depende
 * de dados que so existem depois de consultar o banco.
 *
 * Essa segunda pergunta e regra de negocio e vive no SERVICE. Confundir as duas
 * e um erro comum: a rota fica "protegida", mas o usuario A acessa o recurso do
 * usuario B trocando o id na URL - a falha classica IDOR (Insecure Direct Object
 * Reference).
 *
 * Neste MVP nao ha dado privado por usuario (todo mundo autenticado ve o mesmo
 * estoque da empresa), entao a autorizacao por papel basta. Num sistema
 * multiempresa, cada consulta precisaria ainda filtrar por `companyId`.
 */
