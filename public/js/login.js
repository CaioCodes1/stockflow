import { api, session, showError, clearError } from './api.js';

const alertBox = document.querySelector('#alert');
const formLogin = document.querySelector('#form-login');
const formRegister = document.querySelector('#form-register');

// Quem ja tem sessao valida nao precisa ver esta tela.
if (session.token) window.location.href = '/dashboard.html';

// Mensagem quando o usuario foi devolvido para ca por token expirado.
if (new URLSearchParams(window.location.search).get('expired')) {
  alertBox.textContent = 'Sua sessao expirou. Entre novamente.';
  alertBox.className = 'alert alert-error show';
}

// --- Alternancia entre as abas ---------------------------------------------
document.querySelectorAll('.tabs button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');

    const isLogin = button.dataset.tab === 'login';
    formLogin.classList.toggle('hidden', !isLogin);
    formRegister.classList.toggle('hidden', isLogin);
    clearError(alertBox);
  });
});

/**
 * Envio dos formularios.
 *
 * O `disabled` durante a requisicao evita o duplo clique - que criaria dois
 * cadastros ou duas tentativas de login. Nao e seguranca (o backend continua
 * sendo a autoridade), e sim evitar um problema comum de interface.
 */
async function submit(form, action) {
  const button = form.querySelector('button[type="submit"]');
  const original = button.textContent;

  button.disabled = true;
  button.textContent = 'Aguarde...';
  clearError(alertBox);

  try {
    const { data } = await action();
    session.save(data.token, data.user);
    window.location.href = '/dashboard.html';
  } catch (error) {
    showError(alertBox, error);
    button.disabled = false;
    button.textContent = original;
  }
}

formLogin.addEventListener('submit', (event) => {
  event.preventDefault();
  submit(formLogin, () =>
    api.post('/auth/login', {
      email: document.querySelector('#login-email').value,
      password: document.querySelector('#login-password').value,
    }),
  );
});

formRegister.addEventListener('submit', (event) => {
  event.preventDefault();
  submit(formRegister, () =>
    api.post('/auth/register', {
      name: document.querySelector('#register-name').value,
      email: document.querySelector('#register-email').value,
      password: document.querySelector('#register-password').value,
    }),
  );
});
