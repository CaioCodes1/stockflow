/**
 * Cliente HTTP e utilidades compartilhadas pelo frontend.
 *
 * DUAS IDEIAS IMPORTANTES AQUI:
 *
 * 1. O frontend NAO decide nada. Ele pede, mostra e manda de volta. Toda regra -
 *    se ha estoque, se o SKU repete, se o usuario pode - e decidida pela API.
 *    Esta tela existe para consumir a API, nao para duplicar a logica dela.
 *
 * 2. Esconder botao NAO E SEGURANCA. Mais abaixo o menu esconde opcoes de ADMIN
 *    para quem e EMPLOYEE - isso e CONVENIENCIA, para nao oferecer o que vai dar
 *    erro. Qualquer pessoa apaga esse `if` no DevTools e clica assim mesmo. O que
 *    protege de verdade e o `authorize(ROLES.ADMIN)` no backend, que responde 403
 *    independentemente do que a tela mostre.
 */

const TOKEN_KEY = 'stockflow:token';
const USER_KEY = 'stockflow:user';

/**
 * Onde o token e guardado, e o trade-off assumido.
 *
 * `localStorage` e simples e sobrevive ao recarregar a pagina, mas e legivel por
 * qualquer JavaScript da pagina - ou seja, vulneravel a XSS. A alternativa mais
 * segura seria um cookie `httpOnly`, invisivel ao JavaScript. Escolhemos a
 * simplicidade por ser uma demonstracao, e a decisao esta documentada no README
 * como melhoria futura. Reconhecer o trade-off vale mais do que fingir que ele
 * nao existe.
 */
export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
      return null;
    }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

/** Erro que carrega status e a lista de campos invalidos vinda da API. */
export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors || [];
  }
}

/**
 * Uma unica funcao para falar com a API.
 *
 * Concentrar aqui significa que o header `Authorization`, o tratamento de 401 e
 * o formato de erro sao resolvidos em um lugar so - e nao repetidos (com
 * variacoes e esquecimentos) em cada tela.
 */
async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (session.token) headers.Authorization = `Bearer ${session.token}`;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 em qualquer chamada = token expirou ou foi revogado. Devolve ao login
  // em vez de deixar a tela quebrada exibindo erro atras de erro.
  if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    session.clear();
    window.location.href = '/index.html?expired=1';
    throw new ApiError('Sessao expirada', 401);
  }

  // 204 nao tem corpo - `response.json()` lancaria erro de parse.
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(payload.message || 'Erro inesperado', response.status, payload.errors);
  }

  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

// --- Guarda de rota ---------------------------------------------------------

/**
 * Chamado no topo de cada pagina interna. Se nao ha token, nem adianta carregar.
 *
 * De novo: isto e conveniencia de navegacao, nao seguranca. O dado so aparece
 * porque a API o entregou, e ela so entrega mediante token valido.
 */
export function requireAuth() {
  if (!session.token) {
    window.location.href = '/index.html';
    return null;
  }
  return session.user;
}

export function logout() {
  session.clear();
  window.location.href = '/index.html';
}

// --- Formatacao -------------------------------------------------------------

export const formatMoney = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

export const formatNumber = (value) => new Intl.NumberFormat('pt-BR').format(Number(value) || 0);

export const formatDateTime = (value) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

/**
 * Escapa HTML antes de injetar texto vindo da API.
 *
 * Um produto chamado `<img src=x onerror=alert(1)>` executaria script na tela de
 * todo mundo se fosse concatenado direto no innerHTML. Isso e XSS armazenado -
 * e a defesa e sempre no momento de RENDERIZAR, nao so ao salvar.
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

// --- Componentes de tela ----------------------------------------------------

/** Monta o menu lateral, marcando a pagina atual e ocultando o que o papel nao usa. */
export function renderNav(container, current) {
  const user = session.user;
  if (!user) return;

  const links = [
    { href: '/dashboard.html', label: 'Dashboard', key: 'dashboard' },
    { href: '/products.html', label: 'Produtos', key: 'products' },
    { href: '/movements.html', label: 'Movimentacoes', key: 'movements' },
  ];

  container.innerHTML = `
    <div class="brand"><span class="brand-mark">SF</span> StockFlow</div>
    <nav class="nav">
      ${links
        .map(
          (link) =>
            `<a href="${link.href}" class="${link.key === current ? 'active' : ''}">${link.label}</a>`,
        )
        .join('')}
    </nav>
    <div class="user-box">
      <div class="info">
        <div class="name">${escapeHtml(user.name)}</div>
        <div class="role">${escapeHtml(user.role)}</div>
      </div>
      <button type="button" id="logout">Sair</button>
    </div>
  `;

  container.querySelector('#logout').addEventListener('click', logout);
}

/** Aviso temporario no canto da tela. */
export function toast(message, type = 'success') {
  let element = document.querySelector('.toast');
  if (!element) {
    element = document.createElement('div');
    element.className = 'toast';
    document.body.appendChild(element);
  }

  element.textContent = message;
  element.className = `toast show ${type === 'error' ? 'error' : ''}`;

  clearTimeout(element._timer);
  element._timer = setTimeout(() => {
    element.className = 'toast';
  }, 3600);
}

/**
 * Mostra o erro da API no formulario.
 *
 * Quando vem 422, a API devolve a lista de campos que falharam - exibimos todos
 * de uma vez, em vez de deixar o usuario descobrir um por vez.
 */
export function showError(element, error) {
  const detalhes = error.errors?.length
    ? `<ul>${error.errors.map((e) => `<li>${escapeHtml(e.field)}: ${escapeHtml(e.message)}</li>`).join('')}</ul>`
    : '';

  element.innerHTML = `${escapeHtml(error.message)}${detalhes}`;
  element.className = 'alert alert-error show';
}

export function clearError(element) {
  element.className = 'alert alert-error';
  element.innerHTML = '';
}
