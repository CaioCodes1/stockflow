/**
 * TESTES DE AUTENTICACAO E AUTORIZACAO.
 *
 * O que cada bloco protege esta comentado acima dele. A pergunta que todo teste
 * deve responder e "que bug este teste impede de voltar?" - um teste que nao
 * responde isso e so cerimonia.
 */
import { getApp, resetDatabase, closeDatabase, createUser } from './helpers/setup.js';
import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

let app;

before(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await closeDatabase();
});

describe('POST /api/auth/register', () => {
  // Verifica o caminho feliz E, principalmente, que o hash da senha nao sai na
  // resposta. Vazar hash por descuido de serializacao e um erro real e comum.
  test('cria usuario e devolve token, sem expor a senha', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'Ana Souza',
      email: 'ana@stockflow.com',
      password: 'Senha123',
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.user.email, 'ana@stockflow.com');
    assert.ok(response.body.data.token, 'deveria devolver um token');
    assert.equal(response.body.data.user.password, undefined, 'a senha nao pode aparecer na resposta');
  });

  /**
   * O TESTE MAIS IMPORTANTE DESTE ARQUIVO: protecao contra MASS ASSIGNMENT.
   *
   * Mandamos `role: 'ADMIN'` no corpo. Se o backend repassasse o campo ao banco,
   * qualquer visitante viraria administrador com uma linha de JSON. O papel tem
   * que sair EMPLOYEE independentemente do que o cliente pediu.
   */
  test('ignora o campo role enviado pelo cliente e cria sempre EMPLOYEE', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'Invasor',
      email: 'invasor@stockflow.com',
      password: 'Senha123',
      role: 'ADMIN',
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.user.role, 'EMPLOYEE');
  });

  // Garante que a constraint UNIQUE do banco vira 409 e nao um 500 de erro
  // nao tratado do Prisma.
  test('recusa email duplicado com 409', async () => {
    await createUser({ email: 'ana@stockflow.com' });

    const response = await request(app).post('/api/auth/register').send({
      name: 'Outra Ana',
      email: 'ana@stockflow.com',
      password: 'Senha123',
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.success, false);
    assert.match(response.body.message, /email/i);
  });

  // Verifica que a validacao de entrada barra antes de chegar ao banco, e que a
  // resposta aponta QUAL campo falhou - um 422 sem detalhe nao ajuda ninguem.
  test('recusa senha fraca com 422 e aponta o campo', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'Ana Souza',
      email: 'ana@stockflow.com',
      password: '123',
    });

    assert.equal(response.status, 422);
    assert.ok(Array.isArray(response.body.errors));
    assert.ok(response.body.errors.some((e) => e.field === 'password'));
  });

  test('recusa email em formato invalido', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana Souza', email: 'nao-e-email', password: 'Senha123' });

    assert.equal(response.status, 422);
  });
});

describe('POST /api/auth/login', () => {
  test('autentica com credenciais corretas', async () => {
    await createUser({ email: 'ana@stockflow.com', password: 'Senha123' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@stockflow.com', password: 'Senha123' });

    assert.equal(response.status, 200);
    assert.ok(response.body.data.token);
  });

  /**
   * Confirma que o bcrypt esta de fato comparando: uma implementacao quebrada que
   * aceitasse qualquer senha passaria no teste anterior e falharia neste.
   */
  test('recusa senha errada com 401', async () => {
    await createUser({ email: 'ana@stockflow.com', password: 'Senha123' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@stockflow.com', password: 'SenhaErrada9' });

    assert.equal(response.status, 401);
  });

  /**
   * A mensagem precisa ser IDENTICA para "email nao existe" e "senha errada".
   * Se diferissem, o login viraria um verificador de cadastros: um atacante
   * descobriria quais emails existem antes de gastar tempo com forca bruta.
   */
  test('devolve a mesma mensagem para email inexistente e senha errada', async () => {
    await createUser({ email: 'ana@stockflow.com', password: 'Senha123' });

    const senhaErrada = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@stockflow.com', password: 'SenhaErrada9' });

    const emailInexistente = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ninguem@stockflow.com', password: 'Senha123' });

    assert.equal(senhaErrada.status, emailInexistente.status);
    assert.equal(senhaErrada.body.message, emailInexistente.body.message);
  });

  test('recusa login de usuario desativado', async () => {
    const user = await createUser({ email: 'ana@stockflow.com' });
    const prisma = (await import('../src/config/prisma.js')).prisma;
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@stockflow.com', password: 'Senha123' });

    assert.equal(response.status, 409);
  });
});

describe('Middleware de autenticacao', () => {
  // Sem token: 401. Prova que a rota esta realmente protegida - o erro classico
  // de portfolio e esquecer o `authenticate` em uma rota e nao perceber.
  test('bloqueia rota protegida sem token', async () => {
    const response = await request(app).get('/api/auth/me');
    assert.equal(response.status, 401);
  });

  // Token com assinatura invalida precisa ser recusado: e o que garante que
  // ninguem forja um token trocando o payload.
  test('recusa token invalido', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token.completamente.invalido');

    assert.equal(response.status, 401);
  });

  test('aceita token valido e identifica o usuario', async () => {
    await createUser({ name: 'Ana Souza', email: 'ana@stockflow.com' });

    const { body } = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@stockflow.com', password: 'Senha123' });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.data.token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.email, 'ana@stockflow.com');
  });

  /**
   * O motivo de o middleware consultar o banco em vez de confiar no token.
   * Desativamos o usuario DEPOIS de ele fazer login: o token continua
   * criptograficamente valido, mas o acesso precisa cair na hora.
   */
  test('recusa token de usuario desativado apos o login', async () => {
    const user = await createUser({ email: 'ana@stockflow.com' });

    const { body } = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@stockflow.com', password: 'Senha123' });

    const prisma = (await import('../src/config/prisma.js')).prisma;
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.data.token}`);

    assert.equal(response.status, 401);
  });
});
