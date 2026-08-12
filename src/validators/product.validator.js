import { z } from 'zod';
import { PRODUCT_SORTABLE_FIELDS } from '../constants/index.js';
import { booleanQuery, orderQuery, paginationQuerySchema, searchQuery } from './common.validator.js';

/**
 * Preco: numero positivo com no maximo duas casas decimais.
 *
 * Por que limitar as casas? Porque a coluna e `DECIMAL(10,2)`. Um preco de
 * 10.999 seria arredondado pelo banco silenciosamente, e o valor guardado nao
 * seria o enviado. Melhor recusar na entrada do que gravar algo diferente do que
 * o usuario digitou.
 */
const priceSchema = z.coerce
  .number({ required_error: 'O preco e obrigatorio', invalid_type_error: 'O preco deve ser um numero' })
  .positive('O preco deve ser maior que zero')
  .max(99999999.99, 'Preco acima do limite suportado')
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(String(value)), 'Use no maximo 2 casas decimais');

const skuSchema = z
  .string({ required_error: 'O SKU e obrigatorio' })
  .trim()
  .min(2, 'O SKU precisa ter ao menos 2 caracteres')
  .max(60, 'O SKU pode ter no maximo 60 caracteres')
  // Normalizar para maiusculas evita que "abc-1" e "ABC-1" virem dois produtos
  // distintos - o indice unico do Postgres diferencia caixa.
  .toUpperCase()
  .regex(/^[A-Z0-9._-]+$/, 'O SKU aceita apenas letras, numeros, ponto, hifen e underscore');

export const createProductSchema = z.object({
  name: z
    .string({ required_error: 'O nome e obrigatorio' })
    .trim()
    .min(2, 'O nome precisa ter ao menos 2 caracteres')
    .max(160),

  description: z.string().trim().max(500).optional().nullable(),

  sku: skuSchema,
  price: priceSchema,

  minimumStock: z.coerce
    .number()
    .int('O estoque minimo deve ser um numero inteiro')
    .min(0, 'O estoque minimo nao pode ser negativo')
    .default(0),

  categoryId: z.coerce
    .number({ required_error: 'A categoria e obrigatoria' })
    .int()
    .positive('Categoria invalida'),

  /**
   * Estoque inicial - OPCIONAL, e nao e o mesmo que `stockQuantity`.
   *
   * Se vier maior que zero, o service cria o produto E uma movimentacao de
   * ENTRADA, na mesma transacao. Assim a regra "todo saldo tem origem em um
   * movimento" nao ganha excecao logo no cadastro. Um produto que nasce com 12
   * unidades e nenhuma entrada registrada seria uma inconsistencia no dia um.
   */
  initialStock: z.coerce
    .number()
    .int('O estoque inicial deve ser um numero inteiro')
    .min(0, 'O estoque inicial nao pode ser negativo')
    .default(0),
});

/**
 * Atualizacao (PATCH): todos os campos sao opcionais.
 *
 * POR QUE PATCH E NAO PUT? `PUT` significa, por definicao, substituir o recurso
 * inteiro - campos omitidos deveriam ser apagados. Como as edicoes aqui sao
 * parciais, `PATCH` e o verbo honesto.
 *
 * O BLOQUEIO MAIS IMPORTANTE DESTE ARQUIVO esta em `stockQuantity`: e a regra
 * numero 8 do projeto virando codigo. O estoque nao se edita - ele e consequencia
 * de movimentacoes. Declarar o campo como `never` faz a API responder com uma
 * mensagem explicativa em vez de ignorar em silencio, o que ensina quem consome
 * a API qual e o caminho certo.
 */
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    sku: skuSchema.optional(),
    price: priceSchema.optional(),
    minimumStock: z.coerce.number().int().min(0).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    isActive: z.boolean().optional(),

    stockQuantity: z
      .never({
        invalid_type_error:
          'O estoque nao pode ser alterado diretamente. Registre uma movimentacao em POST /api/movements.',
      })
      .optional(),
  })
  // `.strict()` recusa qualquer campo desconhecido em vez de descartar em
  // silencio. Num PATCH isso importa: quem escreveu `descricao` em vez de
  // `description` merece um erro, e nao a impressao de que salvou.
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Envie ao menos um campo para atualizar',
  });

/**
 * Filtros da listagem.
 *
 * Todos opcionais e COMBINAVEIS: o service monta o `where` somando apenas o que
 * foi enviado. `?search=mouse&category=2&lowStock=true&page=2` funciona sem que
 * exista um `if` para cada combinacao possivel.
 */
export const listProductsQuerySchema = paginationQuerySchema.extend({
  // Busca em nome OU sku, sem diferenciar maiusculas.
  search: searchQuery,

  // Nome `category` (e nao `categoryId`) para bater com a URL do enunciado.
  category: z.coerce.number().int().positive().optional(),

  lowStock: booleanQuery.optional(),

  // Produtos desativados ficam ocultos por padrao. Quem quiser ve-los pede.
  includeInactive: booleanQuery.optional(),

  sort: z.enum(PRODUCT_SORTABLE_FIELDS).default('createdAt'),
  order: orderQuery,
});
