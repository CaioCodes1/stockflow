import { z } from 'zod';
import { MOVEMENT_SORTABLE_FIELDS, MOVEMENT_TYPES } from '../constants/index.js';
import { orderQuery, paginationQuerySchema } from './common.validator.js';

/**
 * Registro de movimentacao.
 *
 * REPARE NO QUE NAO ESTA AQUI: `userId`.
 *
 * O autor da movimentacao NUNCA vem do corpo da requisicao - ele e extraido do
 * token pelo middleware de autenticacao. Se viesse do cliente, qualquer pessoa
 * registraria uma saida em nome de outro funcionario, e o historico - que existe
 * justamente para responder "quem mexeu no estoque" - perderia todo o valor.
 *
 * Regra de bolso: dado que o cliente NAO pode escolher nao entra no schema.
 */
export const createMovementSchema = z.object({
  type: z.enum([MOVEMENT_TYPES.ENTRY, MOVEMENT_TYPES.EXIT], {
    required_error: 'O tipo da movimentacao e obrigatorio',
    invalid_type_error: 'Tipo invalido. Use ENTRY ou EXIT.',
  }),

  /**
   * Quantidade sempre POSITIVA - o sentido vem do `type`.
   *
   * Zero seria uma movimentacao que nao movimenta nada (poluiria o historico) e
   * negativo inverteria o sentido do tipo: um `EXIT -5` viraria uma entrada
   * disfarcada, furando a checagem de estoque suficiente.
   */
  quantity: z.coerce
    .number({ required_error: 'A quantidade e obrigatoria', invalid_type_error: 'A quantidade deve ser um numero' })
    .int('A quantidade deve ser um numero inteiro')
    .positive('A quantidade deve ser maior que zero'),

  productId: z.coerce
    .number({ required_error: 'O produto e obrigatorio' })
    .int()
    .positive('Produto invalido'),
});

export const listMovementsQuerySchema = paginationQuerySchema.extend({
  type: z.enum([MOVEMENT_TYPES.ENTRY, MOVEMENT_TYPES.EXIT]).optional(),
  productId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),

  // Periodo. `z.coerce.date()` aceita '2026-08-01' e ISO completo, e devolve um
  // objeto Date - que e o que o Prisma espera em comparacoes de data.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),

  sort: z.enum(MOVEMENT_SORTABLE_FIELDS).default('createdAt'),
  order: orderQuery,
});
