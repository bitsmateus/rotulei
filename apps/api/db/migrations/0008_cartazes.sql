-- Up Migration
-- =============================================================================
-- O objeto Cartaz do MVP, agora com escopo de tenant.
--
-- Decisao: colunas reais em vez de um blob JSONB.
-- O MVP usava JSONB em `patch` porque os campos de ESTILO ainda estavam
-- crescendo (titulo/subtitulo, bolinha e o bloco avulso/caixa entraram depois
-- da tabela existir). Esse contrato agora esta fechado, e o roadmap comercial
-- pede coisas que so funcionam com coluna de verdade: importacao em lote via
-- CSV, agendamento por data de validade e busca por produto. `layouts_salvos`
-- segue com `patch` JSONB, como no MVP — la o schema livre continua certo.
-- =============================================================================

create table public.cartazes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  loja_id       uuid,

  -- Quem criou. `set null` para nao perder o cartaz ao remover um operador.
  criado_por    uuid references public.usuarios (id) on delete set null,

  -- ── conteudo do produto ────────────────────────────────────────────────────
  -- Precos ficam como TEXT, exatamente como no MVP: sao strings digitadas
  -- ("22,99") e renderizadas com separacao inteiro/virgula/centavos. Converter
  -- para numeric aqui so criaria ida e volta de formatacao sem ganho nenhum —
  -- o cartaz e um artefato de impressao, nao um registro contabil.
  produto       text not null,
  subtitulo     text not null default '',
  peso          text not null default '',
  preco         text not null default '',
  preco_de      text not null default '',
  unidade       text not null default '',
  min_unidades  text not null default '',
  preco_avulso  text not null default '',
  caixa_qtd     text not null default '12',
  caixa_preco   text not null default '',
  preco_litro   text not null default '',

  -- ── aparencia / estilo ─────────────────────────────────────────────────────
  texto_faixa                 text not null default 'OFERTA',
  mostrar_faixa               boolean not null default true,
  mostrar_de_por              boolean not null default false,
  mostrar_logo                boolean not null default true,
  mostrar_bolinha_preco       boolean not null default true,
  mostrar_preco_avulso_caixa  boolean not null default false,
  tema_id                     text not null default 'laranja',
  fonte                       text not null default 'MastersBlack',

  -- ── ajuste manual de tamanho, -3 a +3, cada peca independente ──────────────
  ajuste_nome       smallint not null default 0,
  ajuste_subtitulo  smallint not null default 0,
  ajuste_faixa      smallint not null default 0,
  ajuste_preco      smallint not null default 0,
  ajuste_peso       smallint not null default 0,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint cartazes_produto_nao_vazio check (length(btrim(produto)) > 0),
  constraint cartazes_ajustes_no_intervalo check (
    ajuste_nome      between -3 and 3 and
    ajuste_subtitulo between -3 and 3 and
    ajuste_faixa     between -3 and 3 and
    ajuste_preco     between -3 and 3 and
    ajuste_peso      between -3 and 3
  ),

  -- A loja tem de ser do mesmo tenant do cartaz.
  constraint cartazes_loja_do_mesmo_tenant
    foreign key (loja_id, tenant_id) references public.lojas (id, tenant_id)
    on delete set null (loja_id)
);

create index cartazes_tenant_idx on public.cartazes (tenant_id);
create index cartazes_loja_idx on public.cartazes (tenant_id, loja_id);
create index cartazes_recentes_idx on public.cartazes (tenant_id, criado_em desc);

create trigger cartazes_touch
  before update on public.cartazes
  for each row execute function public.touch_atualizado_em();

-- =============================================================================
-- Layouts salvos — no MVP era uma lista GLOBAL (uma ferramenta, um cliente).
-- Aqui vira por tenant: o layout do Mercado Nunes nao aparece para outro
-- mercado. `patch` continua JSONB, como no MVP.
-- =============================================================================
create table public.layouts_salvos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  nome          text not null,

  -- Subconjunto parcial de Cartaz, so com os 13 campos de estilo. Nunca carrega
  -- conteudo (nome/preco/peso) — e o que faz um layout servir a qualquer
  -- produto novo, em vez de trazer junto os dados de quem salvou primeiro.
  patch         jsonb not null default '{}'::jsonb,

  criado_por    uuid references public.usuarios (id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint layouts_nome_nao_vazio check (length(btrim(nome)) > 0),
  constraint layouts_patch_e_objeto check (jsonb_typeof(patch) = 'object')
);

create index layouts_salvos_tenant_idx on public.layouts_salvos (tenant_id, criado_em);
create unique index layouts_salvos_nome_por_tenant_uk
  on public.layouts_salvos (tenant_id, lower(nome));

create trigger layouts_salvos_touch
  before update on public.layouts_salvos
  for each row execute function public.touch_atualizado_em();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Operador CRIA e IMPRIME cartaz (e o trabalho dele na gondola), entao aqui ele
-- escreve — diferente de lojas/usuarios, onde so admin mexe.
alter table public.cartazes       enable row level security;
alter table public.cartazes       force  row level security;
alter table public.layouts_salvos enable row level security;
alter table public.layouts_salvos force  row level security;

create policy cartazes_leitura on public.cartazes
  for select using (public.app_ve_tenant(tenant_id));

create policy cartazes_insercao on public.cartazes
  for insert with check (public.app_ve_tenant(tenant_id));

create policy cartazes_atualizacao on public.cartazes
  for update using (public.app_ve_tenant(tenant_id))
           with check (public.app_ve_tenant(tenant_id));

create policy cartazes_remocao on public.cartazes
  for delete using (public.app_ve_tenant(tenant_id));

create policy layouts_leitura on public.layouts_salvos
  for select using (public.app_ve_tenant(tenant_id));

create policy layouts_insercao on public.layouts_salvos
  for insert with check (public.app_ve_tenant(tenant_id));

create policy layouts_atualizacao on public.layouts_salvos
  for update using (public.app_ve_tenant(tenant_id))
           with check (public.app_ve_tenant(tenant_id));

create policy layouts_remocao on public.layouts_salvos
  for delete using (public.app_ve_tenant(tenant_id));

-- Down Migration
drop table if exists public.layouts_salvos;
drop table if exists public.cartazes;
