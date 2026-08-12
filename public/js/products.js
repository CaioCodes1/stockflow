import {
  api,
  requireAuth,
  renderNav,
  formatMoney,
  escapeHtml,
  toast,
  showError,
  clearError,
} from './api.js';

const user = requireAuth();
renderNav(document.querySelector('#sidebar'), 'products');

const isAdmin = user.role === 'ADMIN';
if (isAdmin) document.querySelector('#btn-new').classList.remove('hidden');

/** Estado dos filtros - espelha exatamente os parametros aceitos pela API. */
const state = {
  page: 1,
  limit: 10,
  search: '',
  category: '',
  lowStock: new URLSearchParams(location.search).get('lowStock') === 'true',
  sort: 'createdAt',
  order: 'desc',
};

document.querySelector('#filter-low').checked = state.lowStock;

let editingId = null;
let movingProduct = null;

// --- Carregamento -----------------------------------------------------------

/**
 * Monta a query string a partir do estado.
 *
 * `URLSearchParams` cuida da codificacao: uma busca por "cabo & adaptador" vira
 * `cabo+%26+adaptador` e nao quebra a URL. Concatenar string na mao aqui e o
 * caminho mais curto para um bug estranho.
 */
function buildQuery() {
  const params = new URLSearchParams({
    page: state.page,
    limit: state.limit,
    sort: state.sort,
    order: state.sort === 'name' ? 'asc' : state.order,
  });

  if (state.search) params.set('search', state.search);
  if (state.category) params.set('category', state.category);
  if (state.lowStock) params.set('lowStock', 'true');

  return params.toString();
}

async function loadProducts() {
  try {
    const { data, meta } = await api.get(`/products?${buildQuery()}`);
    renderRows(data);
    renderPagination(meta);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function loadCategories() {
  const { data } = await api.get('/categories');

  const filterSelect = document.querySelector('#filter-category');
  const formSelect = document.querySelector('#p-category');

  const options = data
    .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
    .join('');

  filterSelect.innerHTML = `<option value="">Todas as categorias</option>${options}`;
  formSelect.innerHTML = options;
}

// --- Renderizacao -----------------------------------------------------------

function renderRows(products) {
  const tbody = document.querySelector('#rows');

  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhum produto encontrado</td></tr>';
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
        <td>${escapeHtml(product.category?.name ?? '-')}</td>
        <td class="num">${formatMoney(product.price)}</td>
        <td class="num">
          <span class="badge ${product.isLowStock ? 'badge-low' : 'badge-ok'}">
            ${product.stockQuantity}
          </span>
        </td>
        <td class="num">${product.minimumStock}</td>
        <td class="num" style="white-space: nowrap">
          <button class="btn btn-secondary btn-sm" data-action="move" data-id="${product.id}">Movimentar</button>
          ${
            isAdmin
              ? `<button class="btn btn-secondary btn-sm" data-action="edit" data-id="${product.id}">Editar</button>
                 <button class="btn btn-danger btn-sm" data-action="delete" data-id="${product.id}">Excluir</button>`
              : ''
          }
        </td>
      </tr>`,
    )
    .join('');
}

function renderPagination(meta) {
  document.querySelector('#page-info').textContent = meta.total
    ? `${meta.total} produto(s) - pagina ${meta.page} de ${meta.totalPages}`
    : 'Nenhum resultado';

  document.querySelector('#prev').disabled = !meta.hasPreviousPage;
  document.querySelector('#next').disabled = !meta.hasNextPage;
}

// --- Filtros ----------------------------------------------------------------

/**
 * DEBOUNCE na busca.
 *
 * Sem ele, digitar "mouse" dispara 5 requisicoes - uma por tecla - e as respostas
 * podem chegar fora de ordem, fazendo a tela mostrar o resultado de "mou" depois
 * do de "mouse". Esperar 350ms de silencio resolve os dois problemas e alivia o
 * banco.
 */
let searchTimer;
document.querySelector('#filter-search').addEventListener('input', (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = event.target.value.trim();
    state.page = 1; // filtro novo sempre volta para a primeira pagina
    loadProducts();
  }, 350);
});

document.querySelector('#filter-category').addEventListener('change', (event) => {
  state.category = event.target.value;
  state.page = 1;
  loadProducts();
});

document.querySelector('#filter-sort').addEventListener('change', (event) => {
  state.sort = event.target.value;
  state.page = 1;
  loadProducts();
});

document.querySelector('#filter-low').addEventListener('change', (event) => {
  state.lowStock = event.target.checked;
  state.page = 1;
  loadProducts();
});

document.querySelector('#prev').addEventListener('click', () => {
  state.page -= 1;
  loadProducts();
});

document.querySelector('#next').addEventListener('click', () => {
  state.page += 1;
  loadProducts();
});

// --- Modais -----------------------------------------------------------------

function openModal(id) {
  document.querySelector(id).classList.add('open');
}

function closeModal(id) {
  document.querySelector(id).classList.remove('open');
}

document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => {
    button.closest('.modal-backdrop').classList.remove('open');
  });
});

// --- Criar / editar produto -------------------------------------------------

document.querySelector('#btn-new').addEventListener('click', () => {
  editingId = null;
  document.querySelector('#modal-product-title').textContent = 'Novo produto';
  document.querySelector('#form-product').reset();
  // Estoque inicial so faz sentido no cadastro: depois disso, o saldo muda
  // exclusivamente por movimentacao.
  document.querySelector('#field-initial').classList.remove('hidden');
  clearError(document.querySelector('#product-alert'));
  openModal('#modal-product');
});

/**
 * Delegacao de eventos: um ouvinte na tabela inteira, em vez de um por botao.
 * As linhas sao recriadas a cada busca - com um ouvinte por botao, seria preciso
 * registrar tudo de novo a cada renderizacao (e cada esquecimento vira um botao
 * que nao responde).
 */
document.querySelector('#rows').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const id = Number(button.dataset.id);
  const { action } = button.dataset;

  if (action === 'edit') return openEdit(id);
  if (action === 'move') return openMovement(id);
  if (action === 'delete') return removeProduct(id);
});

async function openEdit(id) {
  const { data: product } = await api.get(`/products/${id}`);

  editingId = id;
  document.querySelector('#modal-product-title').textContent = 'Editar produto';
  document.querySelector('#p-name').value = product.name;
  document.querySelector('#p-description').value = product.description ?? '';
  document.querySelector('#p-sku').value = product.sku;
  document.querySelector('#p-price').value = product.price;
  document.querySelector('#p-minimum').value = product.minimumStock;
  document.querySelector('#p-category').value = product.categoryId;
  document.querySelector('#field-initial').classList.add('hidden');

  clearError(document.querySelector('#product-alert'));
  openModal('#modal-product');
}

document.querySelector('#form-product').addEventListener('submit', async (event) => {
  event.preventDefault();

  const alertBox = document.querySelector('#product-alert');
  clearError(alertBox);

  const payload = {
    name: document.querySelector('#p-name').value,
    description: document.querySelector('#p-description').value || null,
    sku: document.querySelector('#p-sku').value,
    price: Number(document.querySelector('#p-price').value),
    minimumStock: Number(document.querySelector('#p-minimum').value),
    categoryId: Number(document.querySelector('#p-category').value),
  };

  try {
    if (editingId) {
      await api.patch(`/products/${editingId}`, payload);
      toast('Produto atualizado');
    } else {
      payload.initialStock = Number(document.querySelector('#p-initial').value) || 0;
      await api.post('/products', payload);
      toast('Produto criado');
    }

    closeModal('#modal-product');
    loadProducts();
  } catch (error) {
    // A validacao do backend e a que vale: exibimos a mensagem dele, campo a campo.
    showError(alertBox, error);
  }
});

async function removeProduct(id) {
  if (!confirm('Desativar este produto? Ele sai das listagens, mas o historico e preservado.')) return;

  try {
    await api.delete(`/products/${id}`);
    toast('Produto desativado');
    loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
}

// --- Movimentacao -----------------------------------------------------------

async function openMovement(id) {
  const { data: product } = await api.get(`/products/${id}`);
  movingProduct = product;

  document.querySelector('#m-product-name').textContent = `${product.name} (${product.sku})`;
  document.querySelector('#m-current').textContent = product.stockQuantity;
  document.querySelector('#form-movement').reset();
  document.querySelector('#m-quantity').value = 1;

  clearError(document.querySelector('#movement-alert'));
  openModal('#modal-movement');
}

document.querySelector('#form-movement').addEventListener('submit', async (event) => {
  event.preventDefault();

  const alertBox = document.querySelector('#movement-alert');
  clearError(alertBox);

  try {
    /**
     * Repare no que NAO e enviado: o saldo novo.
     *
     * Mandamos a INTENCAO ("saiu 3 unidades deste produto") e o backend calcula o
     * resultado. Se a tela enviasse `stockQuantity: 12`, estaria decidindo com um
     * numero que pode ter mudado ha 5 segundos, em outro computador.
     *
     * Tambem nao mandamos quem somos: o autor vem do token.
     */
    const { message } = await api.post('/movements', {
      type: document.querySelector('#m-type').value,
      quantity: Number(document.querySelector('#m-quantity').value),
      productId: movingProduct.id,
    });

    closeModal('#modal-movement');
    toast(message);
    loadProducts();
  } catch (error) {
    // "Estoque insuficiente" chega exatamente daqui - a regra vive no backend.
    showError(alertBox, error);
  }
});

// --- Inicializacao ----------------------------------------------------------
await loadCategories();
await loadProducts();
