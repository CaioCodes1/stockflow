/**
 * Regras de autenticacao.
 *
 * Repare que nao existe `req`, `res` nem status HTTP neste arquivo. Ele lida com
 * usuarios e senhas; a traducao para HTTP e trabalho do controller e do
 * errorHandler.
 */
import { prisma } from '../config/prisma.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { serializeUser } from '../utils/serialize.js';
import { ConflictError, UnauthorizedError } from '../errors/AppError.js';
import { ROLES } from '../constants/index.js';

/**
 * Cadastro publico.
 *
 * O PAPEL E DEFINIDO AQUI, NO SERVIDOR - nunca vem do cliente. Esta linha
 * (`role: ROLES.EMPLOYEE`) e a defesa contra mass assignment: sem ela, bastaria
 * mandar `"role": "ADMIN"` no JSON para virar administrador do sistema.
 *
 * Sobre e-mail duplicado: nao consultamos antes com um `findUnique`. Entre a
 * consulta e o INSERT existe uma janela em que outra requisicao pode cadastrar o
 * mesmo email - e ai o "ja verifiquei" nao vale nada. Deixamos o INDICE UNICO do
 * banco decidir e tratamos o erro P2002, que o errorHandler traduz para 409.
 * Essa e a unica forma sem condicao de corrida.
 */
export async function register({ name, email, password }) {
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: await hashPassword(password),
      role: ROLES.EMPLOYEE,
    },
  });

  // Token junto no cadastro: o usuario ja entra logado, sem precisar repetir as
  // credenciais numa segunda chamada.
  return { user: serializeUser(user), token: signToken(user) };
}

/**
 * Login.
 *
 * DETALHE DE SEGURANCA - a mensagem de erro e IDENTICA para "email nao existe" e
 * "senha errada". Se fossem diferentes, o formulario de login viraria um
 * verificador de cadastros: um atacante testaria uma lista de emails e saberia
 * exatamente quais existem no sistema (enumeracao de usuarios) para so entao
 * concentrar a forca bruta neles.
 *
 * Pelo mesmo motivo, quando o usuario nao existe ainda gastamos tempo comparando
 * contra um hash descartavel. Sem isso, a resposta para email inexistente voltaria
 * visivelmente mais rapido - e essa diferenca de tempo entrega a informacao que a
 * mensagem generica tentava esconder (ataque de temporizacao).
 */
export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await comparePassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw new UnauthorizedError('Email ou senha invalidos');
  }

  const passwordMatches = await comparePassword(password, user.password);
  if (!passwordMatches) throw new UnauthorizedError('Email ou senha invalidos');

  // Conta desativada nao entra. Aqui a mensagem PODE ser especifica: quem chegou
  // ate este ponto ja provou saber a senha, entao nao ha o que revelar.
  if (!user.isActive) {
    throw new ConflictError('Usuario desativado. Procure um administrador.');
  }

  return { user: serializeUser(user), token: signToken(user) };
}

/**
 * Dados do usuario autenticado.
 *
 * Serve para o frontend, ao recarregar a pagina, descobrir quem esta logado e
 * qual o papel - sem precisar decodificar o JWT no navegador (e sem confiar
 * naquilo que ele diz).
 */
export async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return serializeUser(user);
}
