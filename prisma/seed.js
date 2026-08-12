/**
 * SEED - popula o banco com os dados minimos para o sistema ser utilizavel.
 *
 * Rode com: npm run db:seed
 *
 * POR QUE O PRIMEIRO ADMIN NASCE AQUI, E NAO PELA API?
 * Porque `POST /auth/register` cria SEMPRE um EMPLOYEE. Se aceitasse o campo
 * `role` vindo do cliente, qualquer pessoa se tornaria administrador mandando
 * `"role": "ADMIN"` no JSON - a falha conhecida como mass assignment.
 * Alguem precisa ser o primeiro ADMIN, e esse alguem nasce por um script que
 * roda com acesso ao banco, nao pela internet.
 *
 * O seed e IDEMPOTENTE: usa `upsert`, entao rodar dez vezes nao duplica nada.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

const CATEGORIES = ['Eletronicos', 'Perifericos', 'Escritorio', 'Acessorios'];

/**
 * Produtos de demonstracao. `stock` aqui vira uma movimentacao de ENTRADA de
 * verdade - nao escrevemos o saldo direto, nem no seed. A regra "todo saldo tem
 * origem em um movimento" vale para o sistema inteiro, sem excecao.
 */
const PRODUCTS = [
  { sku: 'ELE-001', name: 'Monitor 24" Full HD',        category: 'Eletronicos', price: 899.9,  stock: 12, min: 4 },
  { sku: 'ELE-002', name: 'Notebook 14" i5 8GB',        category: 'Eletronicos', price: 3499.0, stock: 5,  min: 2 },
  { sku: 'PER-001', name: 'Mouse Logitech M170',        category: 'Perifericos', price: 79.9,   stock: 3,  min: 10 },
  { sku: 'PER-002', name: 'Teclado Mecanico ABNT2',     category: 'Perifericos', price: 249.9,  stock: 18, min: 5 },
  { sku: 'PER-003', name: 'Headset USB com microfone',  category: 'Perifericos', price: 189.9,  stock: 2,  min: 6 },
  { sku: 'ESC-001', name: 'Cadeira ergonomica',         category: 'Escritorio',  price: 1249.0, stock: 7,  min: 3 },
  { sku: 'ESC-002', name: 'Resma de papel A4',          category: 'Escritorio',  price: 24.9,   stock: 60, min: 20 },
  { sku: 'ACE-001', name: 'Cabo HDMI 2m',               category: 'Acessorios',  price: 34.9,   stock: 1,  min: 15 },
  { sku: 'ACE-002', name: 'Hub USB-C 6 em 1',           category: 'Acessorios',  price: 219.9,  stock: 9,  min: 4 },
];

async function main() {
  console.log('Iniciando seed...');

  // --- 1. Usuarios ---------------------------------------------------------
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@stockflow.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  const saltRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: process.env.SEED_ADMIN_NAME || 'Administrador',
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, saltRounds),
      role: 'ADMIN',
    },
  });

  const employee = await prisma.user.upsert({
    where: { email: 'funcionario@stockflow.com' },
    update: {},
    create: {
      name: 'Funcionario Demo',
      email: 'funcionario@stockflow.com',
      password: await bcrypt.hash('Func@123', saltRounds),
      role: 'EMPLOYEE',
    },
  });

  console.log(`  usuarios: ${admin.email} (ADMIN), ${employee.email} (EMPLOYEE)`);

  // --- 2. Categorias -------------------------------------------------------
  const categoryByName = new Map();
  for (const name of CATEGORIES) {
    const category = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryByName.set(name, category);
  }
  console.log(`  categorias: ${CATEGORIES.length}`);

  // --- 3. Produtos + entrada inicial ---------------------------------------
  let created = 0;
  for (const item of PRODUCTS) {
    const existing = await prisma.product.findUnique({ where: { sku: item.sku } });
    if (existing) continue;

    // Produto e movimentacao inicial na MESMA transacao: ou nascem os dois, ou
    // nenhum. Um produto com saldo 12 e nenhuma entrada registrada seria uma
    // inconsistencia logo no primeiro dia de vida do banco.
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: item.sku,
          name: item.name,
          description: `${item.name} - item de demonstracao`,
          price: item.price,
          minimumStock: item.min,
          stockQuantity: item.stock,
          categoryId: categoryByName.get(item.category).id,
        },
      });

      if (item.stock > 0) {
        await tx.stockMovement.create({
          data: {
            type: 'ENTRY',
            quantity: item.stock,
            productId: product.id,
            userId: admin.id,
          },
        });
      }
    });
    created += 1;
  }
  console.log(`  produtos: ${created} criados (${PRODUCTS.length - created} ja existiam)`);

  // --- 4. Algumas saidas, para o dashboard ter historico -------------------
  const mouse = await prisma.product.findUnique({ where: { sku: 'PER-002' } });
  if (mouse) {
    const jaTemSaida = await prisma.stockMovement.count({
      where: { productId: mouse.id, type: 'EXIT' },
    });
    if (jaTemSaida === 0) {
      await prisma.$transaction(async (tx) => {
        await tx.stockMovement.create({
          data: { type: 'EXIT', quantity: 3, productId: mouse.id, userId: employee.id },
        });
        await tx.product.update({
          where: { id: mouse.id },
          data: { stockQuantity: { decrement: 3 } },
        });
      });
    }
  }

  console.log('\nSeed concluido.');
  console.log(`  ADMIN     -> ${adminEmail} / ${adminPassword}`);
  console.log('  EMPLOYEE  -> funcionario@stockflow.com / Func@123');
}

main()
  .catch((error) => {
    console.error('Falha no seed:', error);
    // Codigo de saida diferente de zero: um pipeline de CI precisa saber que
    // deu errado. `process.exit(0)` silencioso esconde a falha.
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
