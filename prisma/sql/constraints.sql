-- ---------------------------------------------------------------------------
-- ULTIMA LINHA DE DEFESA: constraints CHECK no proprio banco.
--
-- Rode depois das migrations:   npm run db:constraints
--
-- POR QUE, se o Zod ja valida e o service ja verifica?
-- Porque validacao e defesa em profundidade. O Zod protege contra o CLIENTE.
-- Estas constraints protegem contra NOS MESMOS: um script de importacao, um
-- `UPDATE` manual no psql as tres da manha, um bug num service futuro. O banco
-- e a unica camada por onde absolutamente tudo passa.
--
-- Numa entrevista: "validei em tres niveis - schema de entrada, regra de negocio
-- e constraint no banco - porque cada nivel protege contra um tipo diferente de
-- erro".
--
-- Nao ficam no schema.prisma porque o Prisma ainda nao expressa CHECK de forma
-- declarativa. Sao aditivas e nao interferem nas migrations.
-- ---------------------------------------------------------------------------

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_price_positive,
  ADD CONSTRAINT products_price_positive CHECK (price > 0);

-- A regra de ouro do sistema: estoque nunca fica negativo.
-- Se algum dia esta constraint disparar, temos um bug real na transacao.
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_stock_not_negative,
  ADD CONSTRAINT products_stock_not_negative CHECK (stock_quantity >= 0);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_minimum_stock_not_negative,
  ADD CONSTRAINT products_minimum_stock_not_negative CHECK (minimum_stock >= 0);

-- Quantidade zero seria uma movimentacao que nao movimenta nada;
-- negativa inverteria o sentido do `type`.
ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_quantity_positive,
  ADD CONSTRAINT stock_movements_quantity_positive CHECK (quantity > 0);
