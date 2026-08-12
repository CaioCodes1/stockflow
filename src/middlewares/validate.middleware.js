/**
 * Middleware de validacao de entrada usando Zod.
 *
 * POR QUE VALIDAR NA BORDA?
 * Regra de ouro de backend: NUNCA confie no cliente. O frontend pode ter
 * validacao caprichada, mas qualquer pessoa envia uma requisicao direto por curl
 * ou Postman. Se os dados nao forem checados aqui, chegam sujos no service e no
 * banco - e ai o estrago ja esta gravado.
 *
 * POR QUE UMA BIBLIOTECA (ZOD) E NAO `if`s NO CONTROLLER?
 *  1. O schema e declarativo: ele DESCREVE o formato aceito, em vez de espalhar
 *     vinte comparacoes. Da para ler o contrato do endpoint de uma vez so.
 *  2. Ele CONVERTE junto com validar (`z.coerce.number()`), o que resolve o
 *     problema de a query string ser sempre texto.
 *  3. Ele devolve TODOS os erros de uma vez, com o caminho do campo. Validacao
 *     na mao normalmente para no primeiro problema, e o usuario corrige um
 *     campo por vez.
 *  4. Um lugar so define o formato -> a mensagem de erro sai padronizada em toda
 *     a API, de graca.
 *
 * POR QUE MIDDLEWARE E NAO CHAMADA DENTRO DO CONTROLLER?
 * Porque validacao e uma preocupacao transversal. Como middleware ela roda antes
 * de qualquer controller, falha de forma uniforme e mantem o controller focado
 * em orquestrar. E o controller passa a poder confiar cegamente no `req.body`.
 */
import { ZodError } from 'zod';
import { ValidationError } from '../errors/AppError.js';

/**
 * @param {{ body?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny }} schemas
 */
export function validate(schemas) {
  return function validateMiddleware(req, _res, next) {
    try {
      // O resultado do parse SUBSTITUI o original. A partir daqui o service
      // recebe dados ja normalizados - numero como numero, email em minusculas,
      // espacos aparados - e nunca precisa desconfiar do formato.
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.params) req.params = schemas.params.parse(req.params ?? {});
      if (schemas.query) {
        // `req.query` e somente-leitura no Express 5. Guardar o resultado em
        // `req.validatedQuery` funciona nas duas versoes e deixa explicito, no
        // controller, que aquele objeto ja passou pela validacao.
        req.validatedQuery = schemas.query.parse(req.query ?? {});
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Traduz o erro do Zod numa lista amigavel: campo + mensagem.
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.') || '(raiz)',
          message: issue.message,
        }));
        return next(new ValidationError('Falha na validacao dos dados enviados', details));
      }
      next(error);
    }
  };
}
