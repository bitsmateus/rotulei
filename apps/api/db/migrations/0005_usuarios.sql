-- Up Migration

create table public.usuarios (
  id             uuid primary key default gen_random_uuid(),

  -- null APENAS para superadmin: ele nao pertence a tenant nenhum. E o que faz
  -- as linhas dele ficarem invisiveis para as politicas de RLS dos tenants.
  tenant_id      uuid references public.tenants (id) on delete cascade,

  -- Operador pode ser fixado numa loja; admin normalmente e null (ve todas).
  loja_id        uuid,

  nome           text not null,
  email          text not null,
  papel          text not null,

  -- argon2id. Preenchido no item 3 (auth); aqui so a coluna existe.
  senha_hash     text,

  ativo          boolean not null default true,
  ultimo_login_em timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint usuarios_papel_valido check (papel in ('superadmin', 'admin', 'operador')),
  constraint usuarios_email_formato check (email = lower(email) and email like '%_@_%._%'),

  -- Superadmin nao tem tenant; admin e operador obrigatoriamente tem.
  constraint usuarios_tenant_conforme_papel check (
    (papel = 'superadmin' and tenant_id is null) or
    (papel in ('admin', 'operador') and tenant_id is not null)
  ),

  -- Loja so faz sentido dentro de um tenant.
  constraint usuarios_loja_exige_tenant check (loja_id is null or tenant_id is not null),

  -- FK composta: a loja apontada tem de pertencer ao MESMO tenant do usuario.
  --
  -- A lista de colunas em `set null (loja_id)` (PG 15+) e obrigatoria aqui: um
  -- `set null` simples zeraria TAMBEM o tenant_id ao apagar a loja, e operador
  -- sem tenant viola usuarios_tenant_conforme_papel. Apagar uma loja tem de
  -- soltar o operador dela, nao expulsa-lo do tenant.
  constraint usuarios_loja_do_mesmo_tenant
    foreign key (loja_id, tenant_id) references public.lojas (id, tenant_id)
    on delete set null (loja_id)
);

create unique index usuarios_email_uk on public.usuarios (email);
create index usuarios_tenant_idx on public.usuarios (tenant_id);
create index usuarios_loja_idx on public.usuarios (loja_id);

create trigger usuarios_touch
  before update on public.usuarios
  for each row execute function public.touch_atualizado_em();

-- Down Migration
drop table if exists public.usuarios;
