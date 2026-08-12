/**
 * Infraestrutura da suite de testes.
 *
 * ESTE ARQUIVO PRECISA SER O PRIMEIRO IMPORT DE CADA TESTE. Motivo: modulos ESM
 * sao avaliados na ordem em que aparecem, e a aplicacao le `DATABASE_URL` e
 * `JWT_SECRET` no momento em que e carregada. Se `src/app.js` fosse importado
 * antes daqui, ele ja teria se conectado ao banco de DESENVOLVIMENTO - e os
 * testes, que apagam tudo antes de rodar, destruiriam seus dados.
 *
 * Por isso a aplicacao so e carregada por `import()` dinamico, la embaixo,
 * depois que as variaveis de ambiente estao no lugar.
 *
 * DECISAO: testes de INTEGRACAO contra um Postgres de verdade, e nao unitarios
 * com o banco simulado. Um mock do Prisma devolveria o que mandassemos devolver
 * - ele nao tem constraint UNIQUE, nao tem chave estrangeira, nao tem transacao
 * e nao tem bloqueio de linha. Ou seja: exatamente as coisas que este projeto
 * precisa provar que funcionam. Testar contra mock aqui seria testar o mock.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

// --- 1. Ambiente de teste ---------------------------------------------------
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // silencia o log de acesso na saida da suite
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL nao definida. Copie .env.example para .env.\n' +
      'A suite APAGA todas as tabelas - por isso ela exige um banco separado.',
  );
}

// Trava de seguranca: nunca rodar contra o banco de desenvolvimento.
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL nao pode ser igual a DATABASE_URL.');
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// --- 2. Estrutura do banco de teste -----------------------------------------
// Idempotente: aplicar de novo o que ja esta aplicado nao faz nada.
const migrationsDir = path.join(projectRoot, 'prisma', 'migrations');
const hasMigrations =
  fs.existsSync(migrationsDir) &&
  fs.readdirSync(migrationsDir).some((entry) => fs.statSync(path.join(migrationsDir, entry)).isDirectory());

try {
  execSync(hasMigrations ? 'npx prisma migrate deploy' : 'npx prisma db push --skip-generate', {
    cwd: projectRoot,
    stdio: 'pipe',
    env: process.env,
  });
} catch (error) {
  throw new Error(
    `Nao foi possivel preparar o banco de teste. O container esta no ar?\n` +
      `  docker compose up -d\n\n${error.stdout?.toString() ?? error.message}`,
  );
}

// --- 3. Acesso preguicoso a aplicacao ---------------------------------------
export async function getApp() {
  const module = await import('../../src/app.js');
  return module.default;
}

export async function getPrisma() {
  const module = await import('../../src/config/prisma.js');
  return module.prisma;
}

/**
 * Zera o banco entre testes.
 *
 * POR QUE ISOLAR? Um teste nao pode depender do que outro deixou para tras. Se
 * o teste de produto so passa quando roda depois do de categoria, a suite vira
 * um castelo de cartas: muda a ordem e tudo quebra, e a falha nao aponta para o
 * problema real.
 *
 * `TRUNCATE ... CASCADE` respeita as chaves estrangeiras (limpa as tabelas
 * dependentes junto) e `RESTART IDENTITY` reinicia os contadores de id, para que
 * o primeiro produto de cada teste seja sempre o id 1 - o que torna as
 * asserticoes previsiveis.
 */
export async function resetDatabase() {
  const prisma = await getPrisma();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE stock_movements, products, categories, users RESTART IDENTITY CASCADE',
  );
}

export async function closeDatabase() {
  const prisma = await getPrisma();
  await prisma.$disconnect();
}

// --- 4. Atalhos de cenario --------------------------------------------------

/**
 * Cria um usuario direto no banco.
 *
 * ADMIN nao pode ser criado pela API - `POST /auth/register` sempre gera
 * EMPLOYEE, que e justamente a protecao contra mass assignment que testamos em
 * auth.test.js. Entao o admin nasce aqui, como nasce pelo seed em producao.
 */
export async function createUser({ name = 'Teste', email, password = 'Senha123', role = 'EMPLOYEE' }) {
  const prisma = await getPrisma();
  const { hashPassword } = await import('../../src/utils/password.js');

  return prisma.user.create({
    data: { name, email, password: await hashPassword(password), role },
  });
}

/** Faz login pela API e devolve o token - o mesmo caminho de um cliente real. */
export async function login(request, app, email, password = 'Senha123') {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  return response.body.data.token;
}

/** Cria uma categoria direto no banco (pre-condicao, nao objeto do teste). */
export async function createCategory(name = 'Perifericos') {
  const prisma = await getPrisma();
  return prisma.category.create({ data: { name } });
}
