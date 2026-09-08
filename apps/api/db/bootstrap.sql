-- =============================================================================
-- BOOTSTRAP (parte declarativa) — privilegios das roles do Rotulei.
--
-- A criacao das roles fica em db/scripts/bootstrap.ts (precisa de checagem
-- idempotente que o SQL puro nao tem: nao existe CREATE ROLE IF NOT EXISTS).
-- Este arquivo assume que rotulei_owner e rotulei_app ja existem.
--
-- Roda UMA VEZ por ambiente, com um usuario administrativo:
--   local     -> usuario `postgres` do container
--   EasyPanel -> usuario do servico Postgres
--
--   rotulei_owner  dona das tabelas. Roda migrations. A API NUNCA usa.
--   rotulei_app    a unica role da API. Sem SUPERUSER, sem BYPASSRLS.
--
-- Idempotente: pode rodar de novo sem quebrar nada.
-- :"db_name" e substituido por db/scripts/bootstrap.ts.
-- =============================================================================

-- Cinto e suspensorio: garante que a role da API nao carrega nenhum privilegio
-- que faca o Postgres pular as politicas de RLS.
alter role rotulei_app nosuperuser nocreatedb nocreaterole nobypassrls noreplication;

-- Ninguem alem das nossas roles cria coisa no schema public.
revoke all on schema public from public;
revoke all on database :"db_name" from public;

grant connect on database :"db_name" to rotulei_owner, rotulei_app;
grant usage, create on schema public to rotulei_owner;
grant usage on schema public to rotulei_app;

-- Tudo que o owner criar daqui pra frente ja nasce acessivel (DML apenas) para a
-- API. Note que NAO ha TRUNCATE nem REFERENCES: a API nao esvazia tabela.
alter default privileges for role rotulei_owner in schema public
  grant select, insert, update, delete on tables to rotulei_app;
alter default privileges for role rotulei_owner in schema public
  grant usage, select on sequences to rotulei_app;
alter default privileges for role rotulei_owner in schema public
  grant execute on functions to rotulei_app;
