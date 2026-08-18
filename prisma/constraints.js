/**
 * Aplica as constraints CHECK de `prisma/sql/constraints.sql`.
 *
 *   npm run db:constraints
 *
 * POR QUE UM SCRIPT EM NODE, E NAO UM COMANDO psql?
 * Porque assim o comando funciona igual em qualquer ambiente: com o banco em
 * container, com PostgreSQL instalado na maquina ou com um banco gerenciado na
 * nuvem. Ele reaproveita a mesma `DATABASE_URL` que a aplicacao usa - uma fonte
 * de verdade so - e nao exige ter o cliente `psql` instalado.
 *
 * POR QUE AS CONSTRAINTS NAO ESTAO NO schema.prisma?
 * Porque o Prisma ainda nao expressa `CHECK` de forma declarativa. Elas sao
 * aditivas: nao entram no diff das migrations e nao causam drift.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

/**
 * Separa o arquivo em comandos individuais.
 *
 * O Prisma usa o protocolo estendido do Postgres, que aceita UM comando por
 * chamada - mandar o arquivo inteiro de uma vez falharia. Os comentarios `--`
 * sao removidos antes da divisao para que nenhum `;` dentro de um comentario
 * corte um comando ao meio.
 */
function separarComandos(sql) {
  return sql
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((comando) => comando.trim())
    .filter(Boolean);
}

async function main() {
  const arquivo = path.join(__dirname, 'sql', 'constraints.sql');
  const comandos = separarComandos(fs.readFileSync(arquivo, 'utf8'));

  console.log(`Aplicando ${comandos.length} constraint(s)...`);

  for (const comando of comandos) {
    await prisma.$executeRawUnsafe(comando);
    // Mostra so o nome da constraint, nao o comando inteiro.
    const nome = comando.match(/ADD CONSTRAINT (\w+)/)?.[1] ?? comando.slice(0, 40);
    console.log(`  ok  ${nome}`);
  }

  console.log('\nConstraints aplicadas. O banco agora recusa preco <= 0, estoque negativo');
  console.log('e movimentacao com quantidade <= 0 - mesmo que a aplicacao tente.');
}

main()
  .catch((error) => {
    console.error('Falha ao aplicar as constraints:', error.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
