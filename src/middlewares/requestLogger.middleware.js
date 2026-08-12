/**
 * Log de acesso: uma linha por requisicao, com duracao.
 *
 * Por que registrar a DURACAO? Porque e o dado que revela problema de desempenho
 * antes do usuario reclamar. Uma listagem que passa de 15ms para 800ms depois de
 * um deploy geralmente significa indice esquecido ou consulta N+1.
 *
 * DETALHE DE IMPLEMENTACAO: nao da para logar o status no inicio - ele so existe
 * depois que a resposta e montada. Por isso registramos no evento `finish` do
 * `res`, que o Node dispara quando o ultimo byte foi enviado ao cliente.
 */
import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    const line = `${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs.toFixed(1)}ms`;
    const context = { userId: req.user?.id ?? null };

    // Erro do servidor merece nivel maior que uma requisicao bem-sucedida.
    if (res.statusCode >= 500) logger.error(line, context);
    else if (res.statusCode >= 400) logger.warn(line, context);
    else logger.info(line, context);
  });

  next();
}
