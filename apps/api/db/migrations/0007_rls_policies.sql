-- Up Migration
-- =============================================================================
-- ROW-LEVEL SECURITY
--
-- `force row level security` e o detalhe que quase todo mundo esquece: sem ele,
-- a DONA da tabela (rotulei_owner) ignora as proprias politicas. Como as
-- migrations rodam como owner, sem FORCE o RLS viraria decoracao no dia em que
-- alguem apontasse a API para a conexao errada.
-- =============================================================================

alter table public.planos   enable row level security;
alter table public.planos   force  row level security;
alter table public.tenants  enable row level security;
alter table public.tenants  force  row level security;
alter table public.lojas    enable row level security;
alter table public.lojas    force  row level security;
alter table public.usuarios enable row level security;
alter table public.usuarios force  row level security;

-- ── planos ───────────────────────────────────────────────────────────────────
-- Catalogo publico: a pagina de cadastro precisa listar planos sem login.
create policy planos_leitura on public.planos
  for select using (ativo or public.app_e_global());

create policy planos_escrita on public.planos
  for all using (public.app_e_global()) with check (public.app_e_global());

-- ── tenants ──────────────────────────────────────────────────────────────────
create policy tenants_leitura on public.tenants
  for select using (public.app_ve_tenant(id));

-- Criar tenant e ato do cadastro publico -> contexto 'sistema'.
create policy tenants_insercao on public.tenants
  for insert with check (public.app_e_global());

create policy tenants_atualizacao on public.tenants
  for update using (public.app_ve_tenant(id) and public.app_e_admin())
           with check (public.app_ve_tenant(id) and public.app_e_admin());

create policy tenants_remocao on public.tenants
  for delete using (public.app_e_global());

-- ── lojas ────────────────────────────────────────────────────────────────────
create policy lojas_leitura on public.lojas
  for select using (public.app_ve_tenant(tenant_id));

create policy lojas_insercao on public.lojas
  for insert with check (public.app_ve_tenant(tenant_id) and public.app_e_admin());

create policy lojas_atualizacao on public.lojas
  for update using (public.app_ve_tenant(tenant_id) and public.app_e_admin())
           with check (public.app_ve_tenant(tenant_id) and public.app_e_admin());

create policy lojas_remocao on public.lojas
  for delete using (public.app_ve_tenant(tenant_id) and public.app_e_admin());

-- ── usuarios ─────────────────────────────────────────────────────────────────
create policy usuarios_leitura on public.usuarios
  for select using (public.app_ve_tenant(tenant_id));

-- WITH CHECK impede que um admin de tenant fabrique um superadmin: a linha
-- resultante teria tenant_id null, que `app_ve_tenant` so aceita se o contexto
-- for global.
create policy usuarios_insercao on public.usuarios
  for insert with check (public.app_ve_tenant(tenant_id) and public.app_e_admin());

create policy usuarios_atualizacao on public.usuarios
  for update using (public.app_ve_tenant(tenant_id) and public.app_e_admin())
           with check (public.app_ve_tenant(tenant_id) and public.app_e_admin());

create policy usuarios_remocao on public.usuarios
  for delete using (public.app_ve_tenant(tenant_id) and public.app_e_admin());

-- Todo usuario le e edita o proprio cadastro, qualquer que seja o papel.
create policy usuarios_proprio_perfil_leitura on public.usuarios
  for select using (id = public.app_usuario_id());

-- ── status do tenant: so o sistema muda ──────────────────────────────────────
-- O escopo e explicito: "O status do tenant nunca e setado por uma pessoa — so
-- pelo cadastro publico e pelos dois webhooks do gateway." A politica de UPDATE
-- acima deixa o admin editar nome/cnpj do proprio tenant; este trigger garante
-- que ele nao se auto-reative depois de suspenso.
create or replace function public.tenants_protege_status()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if new.status is distinct from old.status and not public.app_e_global() then
    raise exception 'status do tenant so pode ser alterado pelo sistema (webhook) ou por superadmin'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create trigger tenants_protege_status
  before update on public.tenants
  for each row execute function public.tenants_protege_status();

-- ── controle de migrations fora do alcance da API ────────────────────────────
revoke all on table public.pgmigrations from rotulei_app;

-- Down Migration
grant select, insert, update, delete on table public.pgmigrations to rotulei_app;
drop trigger if exists tenants_protege_status on public.tenants;
drop function if exists public.tenants_protege_status();
drop policy if exists usuarios_proprio_perfil_leitura on public.usuarios;
drop policy if exists usuarios_remocao on public.usuarios;
drop policy if exists usuarios_atualizacao on public.usuarios;
drop policy if exists usuarios_insercao on public.usuarios;
drop policy if exists usuarios_leitura on public.usuarios;
drop policy if exists lojas_remocao on public.lojas;
drop policy if exists lojas_atualizacao on public.lojas;
drop policy if exists lojas_insercao on public.lojas;
drop policy if exists lojas_leitura on public.lojas;
drop policy if exists tenants_remocao on public.tenants;
drop policy if exists tenants_atualizacao on public.tenants;
drop policy if exists tenants_insercao on public.tenants;
drop policy if exists tenants_leitura on public.tenants;
drop policy if exists planos_escrita on public.planos;
drop policy if exists planos_leitura on public.planos;
alter table public.usuarios disable row level security;
alter table public.lojas    disable row level security;
alter table public.tenants  disable row level security;
alter table public.planos   disable row level security;
