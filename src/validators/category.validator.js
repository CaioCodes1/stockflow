import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z
    .string({ required_error: 'O nome da categoria e obrigatorio' })
    .trim()
    .min(2, 'O nome precisa ter ao menos 2 caracteres')
    .max(80, 'O nome pode ter no maximo 80 caracteres'),
});

/**
 * Nao existe unicidade declarada aqui, e isso e intencional: "este nome ja
 * existe?" e uma pergunta que so o BANCO consegue responder sem janela de corrida.
 * O Zod cuida do FORMATO; a constraint UNIQUE cuida da UNICIDADE. O erro P2002
 * que ela gera e traduzido para 409 no errorHandler.
 */
