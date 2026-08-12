import {
  api,
  requireAuth,
  renderNav,
  formatMoney,
  formatNumber,
  formatDateTime,
  escapeHtml,
  toast,
} from './api.js';

requireAuth();
renderNav(document.querySelector('#sidebar'), 'dashboard');

/**
 * UMA chamada monta a tela inteira.
 *
 * A alternativa seria seis requisicoes (totais, estoque baixo, entradas, saidas,
 * valor, ultimas movimentacoes). Alem de mais lento, os numeros poderiam nao
 * bater entre si: uma movimentacao registrada no meio do caminho faria o total
 * do topo discordar da lista de baixo. Um endpoint, um instante no tempo.
 */
async function load() {
  try {
    const { data } = await api.get('/dashboard/summary');
    renderStats(data);
    renderLowStock(data.lowStockProducts);
    renderMovements(data.lastMovements);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function renderStats({ totals, movements }) {
  const cards = [
    { label: 'Produtos', value: formatNumber(totals.products), hint: `${formatNumber(totals.unitsInStock)} unidades` },
    {
      label: 'Estoque baixo',
      value: formatNumber(totals.lowStock),
      hint: totals.lowStock ? 'precisam de reposicao' : 'tudo em ordem',
      variant: totals.lowStock > 0 ? 'is-warning' : 'is-success',
    },
    {
      label: 'Entradas',
      value: formatNumber(movements.entries.count),
      hint: `${formatNumber(movements.entries.units)} unidades`,
    },
    {
      label: 'Saidas',
      value: formatNumber(movements.exits.count),
      hint: `${formatNumber(movements.exits.units)} unidades`,
    },
    { label: 'Valor em estoque', value: formatMoney(totals.stockValue), hint: 'preco x quantidade' },
  ];

  document.querySelector('#stats').innerHTML = cards
    .map(
      (card) => `
      <div class="stat ${card.variant || ''}">
        <div class="label">${card.label}</div>
        <div class="value">${card.value}</div>
        <div class="hint">${card.hint}</div>
      </div>`,
    )
    .join('');
}

function renderLowStock(products) {
  const tbody = document.querySelector('#low-stock');

  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">Nenhum produto abaixo do minimo</td></tr>';
    return;
  }

  tbody.innerHTML = products
    .map(
      (product) => `
      <tr>
        <td>
          <div class="cell-title">${escapeHtml(product.name)}</div>
          <div class="sku">${escapeHtml(product.sku)}</div>
        </td>
        <td class="num"><span class="badge badge-low">${product.stockQuantity}</span></td>
        <td class="num">${product.minimumStock}</td>
      </tr>`,
    )
    .join('');
}

function renderMovements(movements) {
  const tbody = document.querySelector('#last-movements');

  if (!movements.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Nenhuma movimentacao registrada</td></tr>';
    return;
  }

  tbody.innerHTML = movements
    .map(
      (movement) => `
      <tr>
        <td>
          <div class="cell-title">${escapeHtml(movement.product?.name ?? '-')}</div>
          <div class="cell-sub">por ${escapeHtml(movement.user?.name ?? '-')}</div>
        </td>
        <td>
          <span class="badge ${movement.type === 'ENTRY' ? 'badge-entry' : 'badge-exit'}">
            ${movement.type === 'ENTRY' ? 'Entrada' : 'Saida'}
          </span>
        </td>
        <td class="num">${movement.type === 'ENTRY' ? '+' : '-'}${movement.quantity}</td>
        <td class="cell-sub">${formatDateTime(movement.createdAt)}</td>
      </tr>`,
    )
    .join('');
}

load();
