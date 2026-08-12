/**
 * Schemas reaproveitados por varios recursos.
 *
 * O PROBLEMA DA QUERY STRING: ela e SEMPRE texto. Em `?page=2&lowStock=true`, o
 * Express entrega `page = "2"` (string) e `lowStock = "true"` (string). E
 * `"true"` e um valor verdadeiro em JavaScript... mas `"false"` TAMBEM e, porque
 * toda string nao vazia e truthy. Usar `if (query.lowStock)` direto significaria
 * filtrar por estoque baixo mesmo quando o cliente pediu `lowStock=false`.
 *
 * Por isso todo parametro de query passa por coercao explicita aqui.
 */
import { z } from 'zod';
import { PAGINATION } from '../constants/index.js';

/** `/produtos/:id` -> garante que o id e um inteiro positivo antes do banco. */
export const idParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'O id deve ser um numero' })
    .int('O id deve ser um numero inteiro')
    .positive('O id deve ser maior que zero'),
});

/**
 * `?page=&limit=` com valores padrao e TETO.
 *
 * O `.max(MAX_LIMIT)` nao e capricho: sem ele, `?limit=999999999` faz o banco
 * carregar a tabela inteira em memoria e devolver dezenas de MB - uma negacao de
 * servico gratuita, disparada por uma URL.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(PAGINATION.MAX_LIMIT, `O limite maximo por pagina e ${PAGINATION.MAX_LIMIT}`)
    .default(PAGINATION.DEFAULT_LIMIT),
});

/**
 * Converte a string da URL em boolean de verdade.
 * Aceita apenas 'true' e 'false' - qualquer outra coisa vira erro de validacao,
 * em vez de virar `true` por acidente.
 */
export const booleanQuery = z
  .enum(['true', 'false'], { invalid_type_error: 'Use true ou false' })
  .transform((value) => value === 'true');

/** Direcao de ordenacao. */
export const orderQuery = z.enum(['asc', 'desc']).default('desc');

/** Texto de busca: apara espacos e descarta string vazia. */
export const searchQuery = z
  .string()
  .trim()
  .min(1, 'A busca precisa de ao menos 1 caractere')
  .max(120)
  .optional();
