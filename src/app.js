/**
 * Montagem da aplicacao Express.
 *
 * Este arquivo NAO chama `listen`. Ele apenas constroi e exporta o `app`.
 * A separacao app.js / server.js e o que permite:
 *   * testes de integracao - o supertest sobe o app sem ocupar uma porta real,
 *     entao a suite roda em paralelo e nao conflita com o servidor de dev;
 *   * um lugar so para configurar, outro so para inicializar.
 *
 * A ORDEM dos middlewares abaixo e significativa - o Express executa na sequencia
 * em que sao registrados:
 *
 *   1. seguranca e CORS      (antes de tudo)
 *   2. parsers de body       (para que req.body exista nos controllers)
 *   3. log de acesso         (registra tudo, ate o que vai falhar)
 *   4. frontend estatico
 *   5. rotas da API          (o trabalho de verdade)
 *   6. 404                   (nada casou)
 *   7. tratador de erros     (SEMPRE por ultimo)
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { requestLogger } from './middlewares/requestLogger.middleware.js';
import { env } from './config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// --- 1. Seguranca -----------------------------------------------------------
/**
 * `helmet` define headers HTTP de seguranca. Nao e "seguranca artificial": cada
 * header fecha uma classe concreta de ataque no navegador.
 *
 *   X-Content-Type-Options: nosniff  -> impede o navegador de "adivinhar" que um
 *       arquivo enviado como texto e, na verdade, JavaScript - e executa-lo.
 *   X-Frame-Options: DENY            -> impede que o site seja embutido num
 *       iframe invisivel para roubar cliques (clickjacking).
 *   Strict-Transport-Security        -> exige HTTPS nas proximas visitas.
 *   Remove X-Powered-By              -> deixa de anunciar "sou Express".
 *
 * A CSP fica desligada porque o frontend de demonstracao usa scripts inline.
 * Numa aplicacao real com etapa de build, ela deve ser ligada e configurada.
 */
app.use(helmet({ contentSecurityPolicy: false }));

/**
 * CORS.
 *
 * O navegador BLOQUEIA, por padrao, uma pagina servida em localhost:5500 de
 * chamar uma API em localhost:3000 - origens diferentes. Isso e a Same-Origin
 * Policy, e ela existe para que um site malicioso aberto em outra aba nao consiga
 * fazer requisicoes autenticadas a sua API usando as credenciais do usuario.
 *
 * Este middleware envia os headers que autorizam EXPLICITAMENTE certas origens.
 * Ponto importante para entrevista: CORS nao protege o servidor - ele instrui o
 * NAVEGADOR. Um curl ignora CORS completamente, e por isso ele nunca substitui
 * autenticacao. `'*'` so e aceitavel em desenvolvimento.
 */
app.use(
  cors({
    origin: env.corsOrigin.includes('*') ? true : env.corsOrigin,
    credentials: true,
  }),
);

app.disable('x-powered-by');

// Necessario para o rate limit funcionar atras de proxy (Render, Railway, nginx),
// onde o IP real do cliente vem no header X-Forwarded-For.
app.set('trust proxy', 1);

// --- 2. Parsers -------------------------------------------------------------
// Sem isto, `req.body` seria `undefined`: o corpo chega como stream de bytes e
// alguem precisa transformar em objeto. O limite de tamanho evita que alguem
// consuma a memoria do servidor mandando um JSON de 500 MB.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- 3. Logs ----------------------------------------------------------------
// Desligado nos testes: 200 linhas de log poluiriam a saida da suite.
if (!env.isTest) app.use(requestLogger);

// --- 4. Frontend estatico ---------------------------------------------------
// Servir o frontend pelo proprio Express evita o problema de CORS em
// desenvolvimento (mesma origem) e permite subir tudo com um comando so.
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- 5. Rotas da API --------------------------------------------------------
// Prefixo unico `/api`: versionar depois (`/api/v2`) fica trivial, e nao ha
// conflito com as rotas do frontend estatico.
app.use('/api', routes);

// --- 6. 404 e erros ---------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler); // 4 parametros: precisa ser o ULTIMO

export default app;
