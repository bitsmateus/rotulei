-- Up Migration

create table public.tenants (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,

  -- CNPJ guardado so com digitos: mascara e assunto de apresentacao, nao de
  -- armazenamento. Assim a unicidade funciona de verdade.
  cnpj             text not null,
  slug             text not null,

  -- Regra do escopo: status NUNCA e setado por uma pessoa, apenas pelo cadastro
  -- publico e pelos webhooks do gateway. Reforcado pelo trigger abaixo.
  status           text not null default 'trial',

  plano_id         uuid not null references public.planos (id) on delete restrict,
  trial_termina_em timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),

  constraint tenants_status_valido check (
    status in ('trial', 'ativo', 'inadimplente', 'suspenso', 'cancelado')
  ),
  constraint tenants_cnpj_formato check (cnpj ~ '^[0-9]{14}$'),
  constraint tenants_slug_formato check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  constraint tenants_trial_tem_prazo check (status <> 'trial' or trial_termina_em is not null)
);

create unique index tenants_cnpj_uk on public.tenants (cnpj);
create unique index tenants_slug_uk on public.tenants (slug);
create index tenants_status_idx on public.tenants (status);

create trigger tenants_touch
  before update on public.tenants
  for each row execute function public.touch_atualizado_em();

-- Down Migration
drop table if exists public.tenants;
