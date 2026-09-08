-- Up Migration

create table public.lojas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  nome          text not null,
  endereco      text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint lojas_nome_nao_vazio check (length(btrim(nome)) > 0),

  -- Alvo da FK composta em usuarios: garante, no banco, que um usuario nunca
  -- aponta para loja de outro tenant.
  constraint lojas_id_tenant_uk unique (id, tenant_id)
);

create index lojas_tenant_idx on public.lojas (tenant_id);
create unique index lojas_nome_por_tenant_uk on public.lojas (tenant_id, lower(nome));

create trigger lojas_touch
  before update on public.lojas
  for each row execute function public.touch_atualizado_em();

-- Down Migration
drop table if exists public.lojas;
