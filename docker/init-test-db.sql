-- Roda uma unica vez, quando o volume do Postgres e criado pela primeira vez.
--
-- Por que um banco separado para testes?
-- Porque a suite APAGA todas as tabelas antes de cada arquivo de teste. Se ela
-- apontasse para o banco de desenvolvimento, rodar `npm test` destruiria os
-- dados com que voce estava trabalhando.
CREATE DATABASE stockflow_test OWNER stockflow;
