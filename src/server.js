/**
 * Inicializacao do servidor.
 *
 * Unica responsabilidade: ligar o app numa porta e desligar com elegancia.
 */
import app from './app.js';
import { env } from './config/env.js';
import { prisma, disconnectPrisma } from './config/prisma.js';
import { logger } from './utils/logger.js';

async function start() {
  /**
   * Testar a conexao ANTES de aceitar requisicoes.
   *
   * Sem isto, o servidor sobe anunciando "rodando na porta 3000" mesmo com o
   * banco fora do ar, e o problema so aparece na primeira requisicao de um
   * usuario, como um 500 misterioso. Falhar cedo, no boot, com mensagem clara,
   * economiza horas de depuracao.
   */
  try {
    await prisma.$connect();
    logger.info('Conexao com o PostgreSQL estabelecida');
  } catch (error) {
    logger.error('Nao foi possivel conectar ao banco de dados', { message: error.message });
    logger.error('Verifique se o container esta no ar: docker compose up -d');
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info(`StockFlow API rodando em http://localhost:${env.port} (${env.nodeEnv})`);
    logger.info(`Frontend:     http://localhost:${env.port}`);
    logger.info(`Health check: http://localhost:${env.port}/api/health`);
  });

  /**
   * GRACEFUL SHUTDOWN.
   *
   * Quando o processo recebe SIGTERM (o que o Docker e qualquer orquestrador
   * mandam antes de derrubar o container), o comportamento padrao e morrer na
   * hora. Isso significa cortar requisicoes no meio: um usuario que estava
   * registrando uma saida recebe conexao encerrada sem saber se gravou ou nao.
   *
   * O desligamento elegante inverte a ordem:
   *   1. para de aceitar conexoes NOVAS;
   *   2. deixa as requisicoes em andamento terminarem;
   *   3. fecha o pool do banco;
   *   4. so entao encerra o processo.
   *
   * O timer de 10s e a rede de seguranca: se algo travar, o processo sai de
   * qualquer forma em vez de ficar pendurado para sempre.
   */
  async function shutdown(signal) {
    logger.info(`${signal} recebido. Encerrando...`);

    const forceExit = setTimeout(() => {
      logger.error('Encerramento forcado apos 10s de espera');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      await disconnectPrisma();
      logger.info('Servidor encerrado com seguranca');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C

  /**
   * Rede de seguranca para erros que escaparam de todo tratamento.
   * Depois de um `uncaughtException` o processo esta em estado desconhecido -
   * continuar rodando arrisca corromper dados. O certo e registrar e morrer;
   * quem reinicia e o Docker (`restart: unless-stopped`).
   */
  process.on('unhandledRejection', (reason) => {
    logger.error('Promise rejeitada sem tratamento', { reason: String(reason) });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Excecao nao capturada', { message: error.message, stack: error.stack });
    process.exit(1);
  });
}

start();
