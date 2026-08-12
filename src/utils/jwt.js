/**
 * Geracao e verificacao de JSON Web Tokens.
 *
 * O PROBLEMA QUE O JWT RESOLVE:
 * HTTP e stateless - cada requisicao chega sem memoria da anterior. Depois do
 * login, como a proxima requisicao prova quem e? A alternativa classica e a
 * sessao no servidor (o servidor guarda uma tabela de sessoes). O JWT inverte:
 * o SERVIDOR NAO GUARDA NADA. O proprio token carrega a identidade, assinada.
 *
 * ANATOMIA (tres partes separadas por ponto):
 *   header.payload.assinatura
 *   eyJhbGciOi... . eyJzdWIiOjEs... . SflKxwRJSM...
 *
 *   header    -> algoritmo usado
 *   payload   -> os dados (sub, role, iat, exp)
 *   assinatura-> HMAC-SHA256(header + payload, JWT_SECRET)
 *
 * O PONTO MAIS IMPORTANTE, E PERGUNTA CLASSICA DE ENTREVISTA:
 * o payload NAO e secreto. E apenas Base64, nao criptografia - qualquer pessoa
 * cola o token em jwt.io e le o conteudo. Nunca coloque senha ou dado sensivel
 * ali. O que a assinatura garante nao e sigilo, e INTEGRIDADE: se alguem trocar
 * `"role":"EMPLOYEE"` por `"role":"ADMIN"`, a assinatura deixa de bater, porque
 * refaze-la exigiria o JWT_SECRET, que so o servidor tem.
 *
 * LIMITE CONHECIDO DESTA ESCOLHA: como nao ha estado no servidor, nao existe
 * "deslogar" de verdade - um token valido continua valido ate expirar. Mitigamos
 * com validade curta (8h) e com a checagem de `isActive` a cada requisicao no
 * middleware de autenticacao. A solucao completa seria refresh token com
 * revogacao, deixada como melhoria futura.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../errors/AppError.js';

/**
 * @param {{ id: number, role: string }} user
 * @returns {string} token assinado
 */
export function signToken(user) {
  return jwt.sign(
    {
      // `sub` (subject) e o campo padronizado pela RFC 7519 para "de quem e este
      // token". Usar o nome padrao facilita a vida de qualquer ferramenta.
      sub: user.id,
      // A role viaja no token por conveniencia (log, debug), mas a decisao de
      // permissao NAO confia nela: o middleware recarrega o usuario do banco.
      // Se um admin rebaixou alguem ha 10 minutos, o token antigo ainda diria
      // "ADMIN" ate expirar.
      role: user.role,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn },
  );
}

/**
 * Verifica assinatura e expiracao. Lanca 401 - nunca devolve null.
 * Fazer o erro subir evita o esquecimento classico de nao checar o retorno.
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwt.secret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Sessao expirada. Faca login novamente.');
    }
    throw new UnauthorizedError('Token invalido');
  }
}
