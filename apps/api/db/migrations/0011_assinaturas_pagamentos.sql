-- Up Migration
-- =============================================================================
-- Assinaturas e pagamentos — como o ESCOPO.md descreve, com o ajuste da
-- Opcao B (DECISOES.md #18): nao existe cobranca automatica no dia 7 sem
-- cartao. O que existe e um CHECKOUT que o admin abre de dentro do app quando
-- o tenant fica inadimplente (trial vencido ou cobranca recorrente recusada).
-- =============================================================================

create table public.assinaturas (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  plano_id                uuid not null references public.planos (id) on delete restrict,

  -- id da assinatura no Asaas. Null ate o primeiro checkout ser concluido.
  gateway_subscription_id text,

  status                  text not null default 'pendente',
  ciclo                   text not null default 'mensal',
  proxima_cobranca_em     timestamptz,

  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now(),

  constraint assinaturas_status_valido check (
    status in ('pendente', 'ativa', 'inadimplente', 'cancelada')
  ),
  constraint assinaturas_ciclo_valido check (ciclo in ('mensal', 'anual')),

  -- Um tenant tem no maximo UMA assinatura ativa por vez — trocar de plano
  -- atualiza a linha existente, nao cria outra.
  constraint assinaturas_tenant_uk unique (tenant_id)
);

create index assinaturas_gateway_id_idx on public.assinaturas (gateway_subscription_id)
  where gateway_subscription_id is not null;

create trigger assinaturas_touch
  before update on public.assinaturas
  for each row execute function public.touch_atualizado_em();

create table public.pagamentos (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  assinatura_id       uuid references public.assinaturas (id) on delete set null,

  valor_centavos      integer not null,
  metodo              text not null,
  status              text not null default 'pendente',

  -- id da cobranca no Asaas. Unico quando presente: e a chave que faz o
  -- webhook (que pode chegar mais de uma vez para o mesmo evento) ser
  -- idempotente — ver pagamentos_upsert_por_gateway_id.
  gateway_payment_id  text,

  pago_em             timestamptz,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),

  constraint pagamentos_valor_positivo check (valor_centavos > 0),
  constraint pagamentos_metodo_valido check (metodo in ('pix', 'boleto', 'cartao')),
  constraint pagamentos_status_valido check (
    status in ('pendente', 'confirmado', 'recusado', 'estornado', 'cancelado')
  )
);

create unique index pagamentos_gateway_id_uk on public.pagamentos (gateway_payment_id)
  where gateway_payment_id is not null;
create index pagamentos_tenant_idx on public.pagamentos (tenant_id, criado_em desc);

create trigger pagamentos_touch
  before update on public.pagamentos
  for each row execute function public.touch_atualizado_em();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- O tenant LE a propria assinatura e os proprios pagamentos (fatura, historico).
-- Quem ESCREVE e sempre o sistema (checkout, webhook) ou superadmin — nunca uma
-- pessoa de dentro do tenant, pelo mesmo motivo do status do tenant: o dado
-- reflete o que o gateway confirmou, nao o que alguem preencheu num formulario.
alter table public.assinaturas enable row level security;
alter table public.assinaturas force  row level security;
alter table public.pagamentos  enable row level security;
alter table public.pagamentos  force  row level security;

create policy assinaturas_leitura on public.assinaturas
  for select using (public.app_ve_tenant(tenant_id));

create policy assinaturas_escrita on public.assinaturas
  for all using (public.app_e_global()) with check (public.app_e_global());

create policy pagamentos_leitura on public.pagamentos
  for select using (public.app_ve_tenant(tenant_id));

create policy pagamentos_escrita on public.pagamentos
  for all using (public.app_e_global()) with check (public.app_e_global());

-- Down Migration
drop table if exists public.pagamentos;
drop table if exists public.assinaturas;
