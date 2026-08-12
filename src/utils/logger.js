/**
 * Logger minimo, sem dependencia externa.
 *
 * Por que nao winston ou pino? Porque em um MVP o que se precisa de um logger e:
 * niveis, carimbo de tempo e contexto. Sao 40 linhas. Adicionar uma dependencia
 * para isso seria peso sem retorno - e o objetivo do projeto e justamente nao
 * carregar tecnologia desnecessaria.
 *
 * O que se perde, e vale saber responder: log estruturado em JSON, transportes
 * (arquivo, syslog) e rotacao. Numa aplicacao de verdade, com agregador de logs,
 * isso pesa - e ai a dependencia se justifica.
 *
 * Por que niveis? Para separar ruido de sinal. Em producao voce quer `warn` e
 * `error`; em desenvolvimento, tudo.
 */
import { env } from '../config/env.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[env.logLevel] ?? LEVELS.info;

function log(level, message, context) {
  if (LEVELS[level] > currentLevel) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] ${level.toUpperCase().padEnd(5)}`;
  const extra = context && Object.keys(context).length ? ` ${JSON.stringify(context)}` : '';

  // error e warn vao para stderr; o resto para stdout. E o que permite, em
  // producao, redirecionar apenas os problemas para outro destino.
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  stream(`${prefix} ${message}${extra}`);
}

export const logger = {
  error: (message, context) => log('error', message, context),
  warn: (message, context) => log('warn', message, context),
  info: (message, context) => log('info', message, context),
  debug: (message, context) => log('debug', message, context),
};
