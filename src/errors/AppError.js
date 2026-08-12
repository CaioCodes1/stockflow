/**
 * Erros de aplicacao.
 *
 * O PROBLEMA que isto resolve:
 * A camada de service sabe QUE deu errado ("nao ha estoque suficiente"), mas nao
 * deveria saber NADA sobre HTTP - ela nao pode chamar `res.status(400)`. Se
 * pudesse, seria impossivel reaproveitar o mesmo service num script de
 * importacao, num job agendado ou num teste unitario.
 *
 * A SOLUCAO:
 * O service lanca um erro tipado (`throw new ConflictError(...)`) que carrega o
 * statusCode como DADO. O errorHandler, la na fronteira HTTP, le esse dado e
 * monta a resposta. Cada camada continua sabendo apenas o que lhe cabe.
 *
 * `isOperational` distingue:
 *   true  -> erro esperado do fluxo (404, 403, validacao). Mostra ao cliente.
 *   false -> bug ou falha de infra. Vira 500 generico e vai para o log, porque a
 *            mensagem original pode vazar detalhes internos do sistema.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 - o cliente mandou dados invalidos ou a operacao nao faz sentido agora. */
export class BadRequestError extends AppError {
  constructor(message = 'Requisicao invalida', details = null) {
    super(message, 400, details);
  }
}

/** 401 - "eu nao sei quem voce e". Falta token, token invalido ou expirado. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Credenciais invalidas ou ausentes') {
    super(message, 401);
  }
}

/**
 * 403 - "eu sei quem voce e, e voce nao pode fazer isso".
 * A confusao entre 401 e 403 e uma das perguntas mais comuns em entrevista:
 *   401 = problema de AUTENTICACAO (identidade)
 *   403 = problema de AUTORIZACAO  (permissao)
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Voce nao tem permissao para executar esta acao') {
    super(message, 403);
  }
}

/** 404 - o recurso pedido nao existe. */
export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} nao encontrado`, 404);
  }
}

/**
 * 409 - conflito com o estado atual do recurso.
 * Ex.: SKU ja cadastrado, email ja em uso, categoria com produtos vinculados.
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflito com o estado atual do recurso') {
    super(message, 409);
  }
}

/** 422 - sintaxe ok, mas os dados nao passam nas regras de validacao. */
export class ValidationError extends AppError {
  constructor(message = 'Dados invalidos', details = null) {
    super(message, 422, details);
  }
}
