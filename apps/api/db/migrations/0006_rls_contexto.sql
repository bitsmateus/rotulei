-- Up Migration
-- =============================================================================
-- CONTEXTO DE SESSAO
--
-- A API abre uma transacao por request e injeta, antes de qualquer query:
--
--   set_config('app.tenant_id',  '<uuid>', true)
--   set_config('app.usuario_id', '<uuid>', true)
--   set_config('app.papel',      'admin',  true)   -- admin|operador|superadmin|sistema
--
-- O terceiro argumento `true` = LOCAL: o valor morre junto com a transacao, o
-- que impede vazamento de contexto entre requests que reusam a mesma conexao
-- do pool. Se a transacao nao existir, o set nao gruda — por isso a regra de
-- "transacao por request, sem excecao" no ContextoDbService.
--
-- Sem contexto setado, current_setting(...,true) devolve NULL, as politicas
-- avaliam NULL (nao TRUE) e o acesso e NEGADO. O modo de falha e negar.
-- =============================================================================

create or replace function public.app_tenant_id() returns uuid
language sql stable
set search_path = pg_catalog, pg_temp
as $fn$ select nullif(current_setting('app.tenant_id', true), '')::uuid $fn$;

create or replace function public.app_usuario_id() returns uuid
language sql stable
set search_path = pg_catalog, pg_temp
as $fn$ select nullif(current_setting('app.usuario_id', true), '')::uuid $fn$;

create or replace function public.app_papel() returns text
language sql stable
set search_path = pg_catalog, pg_temp
as $fn$ select nullif(current_setting('app.papel', true), '') $fn$;

-- Papeis que enxergam todos os tenants. `sistema` e o contexto de webhooks e
-- jobs (ex.: Asaas confirmando pagamento) — nunca vem de um JWT de usuario.
create or replace function public.app_e_global() returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $fn$ select public.app_papel() in ('superadmin', 'sistema') $fn$;

-- Predicado de escopo usado por praticamente toda politica.
create or replace function public.app_ve_tenant(alvo uuid) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $fn$ select public.app_e_global() or (alvo is not null and alvo = public.app_tenant_id()) $fn$;

-- Quem pode administrar o proprio tenant (lojas, usuarios, marca).
create or replace function public.app_e_admin() returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $fn$ select public.app_papel() = 'admin' or public.app_e_global() $fn$;

comment on function public.app_tenant_id() is 'Tenant do contexto atual (NULL se nao setado).';
comment on function public.app_e_global() is 'TRUE para superadmin e sistema — enxergam todos os tenants.';

-- Down Migration
drop function if exists public.app_e_admin();
drop function if exists public.app_ve_tenant(uuid);
drop function if exists public.app_e_global();
drop function if exists public.app_papel();
drop function if exists public.app_usuario_id();
drop function if exists public.app_tenant_id();
