import { api, requireAuth, renderNav, formatDateTime, escapeHtml, toast } from './api.js';

requireAuth();
renderNav(document.querySelector('#sidebar'), 'movements');

const state = { page: 1, limit: 15, type: '', productId: '', from: '', to: '' };

function buildQuery() {
  const params = new URLSearchParams({ page: state.page, limit: state.limit });

  if (state.type) params.set('type', state.type);
  if (state.productId) params.set('productId', state.productId);
  if (state.from) params.set('from', state.from);
  // `to` vira o fim do dia: sem isso, filtrar "ate 09/08" excluiria tudo que
  // aconteceu no dia 09, porque a data pura equivale a meia-noite.
  if (state.to) params.set('to', `${state.to}T23:59:59`);

  return params.toString();
}

async function loadMovements() {
  try {
    const { data, meta } = await api.get(`/movements?${buildQuery()}`);
    renderRows(data);

    document.querySelector('#page-info').textContent = meta.total
      ? `${meta.total} movimentacao(oes) - pagina ${meta.page} de ${meta.totalPages}`
      : 'Nenhum resultado';

    document.querySelector('#prev').disabled = !meta.hasPreviousPage;
    document.querySelector('#next').disabled = !meta.hasNextPage;
  } catch (error) {
    toast(error.message, 'error');
  }
}

function renderRows(movements) {
  const tbody = document.querySelector('#rows');

  if (!movements.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Nenhuma movimentacao encontrada</td></tr>';
    return;
  }

  tbody.innerHTML = movements
    .map(
      (movement) => `
      <tr>
        <td class="cell-sub">${formatDateTime(movement.createdAt)}</td>
        <td>
          <div class="cell-title">${escapeHtml(movement.product?.name ?? '-')}</div>
          <div class="sku">${escapeHtml(movement.product?.sku ?? '')}</div>
        </td>
        <td>
          <span class="badge ${movement.type === 'ENTRY' ? 'badge-entry' : 'badge-exit'}">
            ${movement.type === 'ENTRY' ? 'Entrada' : 'Saida'}
          </span>
        </td>
        <td class="num">${movement.type === 'ENTRY' ? '+' : '-'}${movement.quantity}</td>
        <td>${escapeHtml(movement.user?.name ?? '-')}</td>
      </tr>`,
    )
    .join('');
}

/** Carrega os produtos para o filtro. Limite alto porque e so para o select. */
async function loadProducts() {
  const { data } = await api.get('/products?limit=100&sort=name&order=asc');

  document.querySelector('#filter-product').innerHTML =
    '<option value="">Todos os produtos</option>' +
    data
      .map((product) => `<option value="${product.id}">${escapeHtml(product.name)}</option>`)
      .join('');
}

['type', 'product', 'from', 'to'].forEach((field) => {
  document.querySelector(`#filter-${field}`).addEventListener('change', (event) => {
    state[field === 'product' ? 'productId' : field] = event.target.value;
    state.page = 1;
    loadMovements();
  });
});

document.querySelector('#prev').addEventListener('click', () => {
  state.page -= 1;
  loadMovements();
});

document.querySelector('#next').addEventListener('click', () => {
  state.page += 1;
  loadMovements();
});

await loadProducts();
await loadMovements();
