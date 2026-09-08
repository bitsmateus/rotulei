-- Up Migration

-- Mantem `atualizado_em` correto sem depender da aplicacao lembrar de setar.
create or replace function public.touch_atualizado_em()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  new.atualizado_em := now();
  return new;
end;
$fn$;

comment on function public.touch_atualizado_em() is
  'Trigger BEFORE UPDATE: atualiza a coluna atualizado_em.';

-- Down Migration
drop function if exists public.touch_atualizado_em();
