import { z } from 'zod';

/**
 * Cadastro.
 *
 * REPARE NO QUE NAO ESTA AQUI: o campo `role`.
 *
 * Isso e proposital e e a defesa contra MASS ASSIGNMENT - a falha em que o
 * cliente injeta um campo que nao deveria controlar e o backend o repassa
 * cegamente ao banco. Se `role` fosse aceito, este JSON criaria um administrador:
 *
 *   { "name": "Fulano", "email": "a@b.c", "password": "...", "role": "ADMIN" }
 *
 * Como o schema descarta chaves desconhecidas, o campo simplesmente nao chega ao
 * service. O papel e definido no servidor, sempre EMPLOYEE. O primeiro ADMIN
 * nasce pelo seed.
 */
export const registerSchema = z.object({
  name: z
    .string({ required_error: 'O nome e obrigatorio' })
    .trim()
    .min(3, 'O nome precisa ter ao menos 3 caracteres')
    .max(120, 'O nome pode ter no maximo 120 caracteres'),

  email: z
    .string({ required_error: 'O email e obrigatorio' })
    .trim()
    // Normalizar para minusculas evita que "Ana@x.com" e "ana@x.com" virem duas
    // contas - o indice unico do Postgres diferencia maiusculas de minusculas.
    .toLowerCase()
    .email('Email invalido')
    .max(160),

  password: z
    .string({ required_error: 'A senha e obrigatoria' })
    .min(8, 'A senha precisa ter ao menos 8 caracteres')
    // Limite superior porque o bcrypt so considera os primeiros 72 BYTES da
    // senha; alem disso, hashear uma string enorme e trabalho desperdicado que
    // um atacante poderia explorar para consumir CPU.
    .max(72, 'A senha pode ter no maximo 72 caracteres')
    .regex(/[a-zA-Z]/, 'A senha precisa conter ao menos uma letra')
    .regex(/[0-9]/, 'A senha precisa conter ao menos um numero'),
});

/**
 * Login.
 *
 * Aqui a senha so precisa existir - nao repetimos as regras de complexidade.
 * Motivo: se o formato fosse validado, a mensagem "senha precisa de um numero"
 * confirmaria a um atacante que a senha tentada nao e a correta por um motivo
 * diferente de estar errada. Login responde uma coisa so: entrou ou nao entrou.
 */
export const loginSchema = z.object({
  email: z.string({ required_error: 'O email e obrigatorio' }).trim().toLowerCase().email('Email invalido'),
  password: z.string({ required_error: 'A senha e obrigatoria' }).min(1, 'A senha e obrigatoria'),
});
