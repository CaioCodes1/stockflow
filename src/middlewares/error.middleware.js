/**
 * TRATAMENTO CENTRALIZADO DE ERROS.
 *
 * Este e o UNICO lugar do sistema que decide status HTTP e formato de resposta
 * de erro. Todo o resto apenas faz `throw`. O ganho: mudar o formato do erro da
 * API inteira e mudar este arquivo, e nao procurar `res.status(400)` espalhado
 * por trinta controllers.
 *
 * COMO O EXPRESS SABE QUE ISTO E UM TRATADOR DE ERRO?
 * Pela ARIDADE da funcao: quatro parametros (err, req, res, next). Com tres, o
 * Express o trataria como middleware comum e ele nunca receberia os erros. Por
 * isso o `_next` precisa existir mesmo sem ser usado - remove-lo quebra o
 * mecanismo silenciosamente.
 *
 * Ele tambem precisa ser registrado POR ULTIMO no app.js, depois das rotas.
 */
import { AppError } from '../errors/AppError.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/** 404 para qualquer rota que nao casou com nada. */
export function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    message: `Rota nao encontrada: ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Erro interno do servidor';
  let details = err.details || null;

  // Guardamos o estado original para saber, mais abaixo, se NOS traduzimos o
  // erro. Sem isso, a regra "nao vazar mensagem de erro nao operacional" - que
  // existe para nao entregar detalhe interno ao cliente - engoliria tambem as
  // traducoes deliberadas, e um 503 sairia como "Erro interno do servidor".
  const originalStatus = statusCode;
  const originalMessage = message;

  // --- Traducao de erros de INFRAESTRUTURA para erros de NEGOCIO ------------
  //
  // O Prisma fala em codigos ('P2002'). O cliente da API nao deveria precisar
  // entende-los - nem descobrir por eles qual banco ou ORM usamos. Traduzimos
  // aqui, na fronteira, para uma mensagem de dominio.
  //
  // Isso tambem sustenta uma decisao de arquitetura importante: em vez de
  // consultar antes ("ja existe esse SKU?") e so entao inserir - o que deixa uma
  // janela para outra requisicao entrar no meio - deixamos o BANCO decidir e
  // tratamos a violacao da constraint. E a unica forma realmente livre de
  // condicao de corrida.
  /**
   * ARMADILHA DO PRISMA, descoberta testando com o banco desligado:
   *
   * Erros de QUERY (`PrismaClientKnownRequestError`) trazem o codigo em `code` -
   * P2002, P2025 e companhia. Mas o erro de CONEXAO
   * (`PrismaClientInitializationError`, o "banco fora do ar") chega com `code` e
   * `errorCode` ambos `undefined`. Nenhum `switch` sobre codigo o alcanca.
   *
   * Sem o tratamento pelo nome da classe abaixo, uma queda do banco viraria 500
   * generico - e o cliente nao teria como distinguir "o servico esta fora do ar,
   * tente de novo" de "voce mandou algo errado, nao adianta repetir".
   */
  if (err.name === 'PrismaClientInitializationError') {
    statusCode = 503;
    message = 'Banco de dados indisponivel';
  }

  switch (err.code ?? err.errorCode) {
    case 'P2002': {
      // Violacao de UNIQUE. `meta.target` diz qual campo causou.
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
      statusCode = 409;
      message = target?.includes('sku')
        ? 'Ja existe um produto com este SKU'
        : target?.includes('email')
          ? 'Este email ja esta cadastrado'
          : 'Ja existe um registro com esse valor unico';
      break;
    }
    case 'P2003':
      // Violacao de chave estrangeira: apontou para algo que nao existe.
      statusCode = 400;
      message = 'Referencia invalida: o registro relacionado nao existe';
      break;
    case 'P2025':
      // Tentou atualizar/apagar um registro que nao existe mais.
      statusCode = 404;
      message = 'Registro nao encontrado';
      break;
    case 'P2014':
      statusCode = 409;
      message = 'Nao e possivel remover: existem registros vinculados a este item';
      break;
    case 'P1000': // autenticacao no banco recusada
    case 'P1001': // servidor inalcancavel
    case 'P1002': // timeout de conexao
    case 'P1017': // conexao encerrada pelo servidor
      statusCode = 503;
      message = 'Banco de dados indisponivel';
      break;
    default:
      break;
  }

  // JSON malformado no corpo - erro do body-parser, nao nosso.
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'JSON malformado no corpo da requisicao';
  }

  // Traduzido por nos = mensagem escrita a mao, segura de mostrar.
  const translated = statusCode !== originalStatus || message !== originalMessage;

  const isOperational = err instanceof AppError || translated || statusCode < 500;

  // --- Log -----------------------------------------------------------------
  const context = {
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id ?? null,
    statusCode,
  };

  if (statusCode >= 500) {
    // 5xx e problema NOSSO. O stack so entra quando o erro NAO foi tratado - num
    // 503 de banco fora do ar ele nao acrescenta nada a mensagem e enche o log.
    logger.error(message, isOperational ? context : { ...context, stack: err.stack });
  } else {
    // 4xx e o cliente errando: registra sem stack, so para observabilidade.
    logger.warn(message, context);
  }

  // --- Resposta ------------------------------------------------------------
  // Regra de seguranca: mensagem de erro NAO operacional nao vaza para fora. Um
  // stack trace ou 'relation "products" does not exist' entrega ao atacante a
  // estrutura interna do sistema.
  const body = {
    success: false,
    message: isOperational ? message : 'Erro interno do servidor',
  };

  if (details) body.errors = details;

  // Stack apenas em desenvolvimento e apenas para o que NAO foi tratado: e nesse
  // caso que ele ajuda a depurar. Num 503 de banco fora do ar ele so polui, e em
  // producao nunca sai - entregaria caminhos de arquivo e estrutura interna.
  if (!env.isProduction && !isOperational) body.stack = err.stack;

  return res.status(statusCode).json(body);
}
