/**
 * Instancia UNICA do Prisma Client (singleton).
 *
 * POR QUE UMA SO?
 * Cada `new PrismaClient()` abre seu proprio POOL DE CONEXOES com o Postgres.
 * Se cada service criasse o seu, uma API com seis services abriria seis pools e
 * esgotaria o limite de conexoes do banco (o default do Postgres e 100) com
 * pouquissimo trafego. Um modulo ESM e avaliado uma unica vez por processo -
 * entao `import { prisma }` sempre devolve o mesmo objeto.
 *
 * O QUE E O PRISMA CLIENT?
 * E um ORM: a camada que traduz metodos JavaScript (`prisma.product.findMany`)
 * para SQL, e as linhas de volta para objetos. O que ele nos da em troca de uma
 * dependencia a mais:
 *   * TIPAGEM E AUTOCOMPLETE gerados a partir do schema - errar um nome de
 *     coluna vira erro na hora de escrever, nao em producao.
 *   * PARAMETRIZACAO AUTOMATICA - toda query sai preparada, o que fecha a porta
 *     para SQL injection sem exigir disciplina de quem escreve.
 *   * MIGRATIONS versionadas junto com o codigo.
 *
 * O que se perde (e e honesto dizer em entrevista): controle fino sobre o SQL
 * gerado. Quando a consulta e realmente analitica, descemos para `$queryRaw` -
 * como no dashboard.
 */
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

export const prisma = new PrismaClient({
  // Em desenvolvimento, ver o SQL de verdade que o ORM gerou e a melhor forma de
  // nao tratar o Prisma como caixa-preta - e de perceber quando uma listagem
  // esta disparando uma query por linha (o classico problema N+1).
  log: env.logLevel === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

/**
 * Fecha o pool com elegancia. Chamado no shutdown do servidor.
 * Sem isto, o processo pode terminar deixando conexoes penduradas no banco.
 */
export async function disconnectPrisma() {
  await prisma.$disconnect();
}
