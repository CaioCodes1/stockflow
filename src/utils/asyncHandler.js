/**
 * Embrulha um handler assincrono para que erros cheguem ao errorHandler.
 *
 * O PROBLEMA:
 * O Express 4 nao entende Promises. Se um `async` handler lanca (ou rejeita), o
 * Express nao percebe: a requisicao fica pendurada ate o timeout do cliente e o
 * erro vira um "unhandled rejection" no terminal. Sem isto, todo controller
 * precisaria de um try/catch identico com `catch (e) { next(e) }` - dezenas de
 * blocos repetidos, e basta esquecer um para a rota travar em silencio.
 *
 * A SOLUCAO:
 * `Promise.resolve(fn(...)).catch(next)`. Qualquer rejeicao vai automaticamente
 * para o `next(erro)`, que e como o Express pula direto para o tratador de erros.
 *
 * (O Express 5 passou a fazer isso nativamente. Mantemos o helper porque o
 * projeto usa a versao 4 e porque deixa explicito o que esta acontecendo.)
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
