-- Up Migration
-- =============================================================================
-- Configuracao da plataforma — hoje, so o Asaas.
--
-- Decisao do dono do produto (DECISOES.md #17): a credencial do gateway e
-- cadastrada dentro da ferramenta, pelo superadmin, nao numa variavel de
-- ambiente do EasyPanel. Trocar o token vira formulario, nao redeploy.
--
-- Isso so e seguro porque:
--  1. O valor fica CIFRADO (AES-256-GCM, ver CryptoService). Nunca em texto puro.
--  2. A chave de cifra (CONFIG_SECRET) vive no ambiente, nunca no banco — um
--     dump do banco sozinho nao entrega a credencial.
--  3. O valor NUNCA volta pela API, nem para superadmin. So "configurado?",
--     ambiente e os ultimos 4 caracteres. Trocar = escrever de novo.
-- =============================================================================

create table public.config_plataforma (
  id               uuid primary key default gen_random_uuid(),

  -- 'asaas' hoje; chave livre para o dia em que houver outro gateway/canal.
  chave            text not null,

  -- 'sandbox' | 'production'. Guardado fora do JSON cifrado de proposito: o
  -- superadmin precisa ver isso sem decifrar nada.
  ambiente         text not null default 'sandbox',

  -- JSON cifrado: { apiKey, webhookToken }. Ver CryptoService.cifrarJson.
  credenciais_cifradas text not null,

  -- So os ultimos 4 caracteres da apiKey, em claro — o suficiente para o
  -- superadmin confirmar "e essa chave mesmo" sem expor o segredo inteiro.
  credencial_dica  text,

  atualizado_por   uuid references public.usuarios (id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),

  constraint config_plataforma_ambiente_valido check (ambiente in ('sandbox', 'production'))
);

create unique index config_plataforma_chave_uk on public.config_plataforma (chave);

create trigger config_plataforma_touch
  before update on public.config_plataforma
  for each row execute function public.touch_atualizado_em();

-- Configuracao da plataforma nao tem tenant: so superadmin (humano) e sistema
-- (webhook/servico interno construindo o client do gateway) enxergam.
alter table public.config_plataforma enable row level security;
alter table public.config_plataforma force  row level security;

create policy config_plataforma_acesso on public.config_plataforma
  for all using (public.app_e_global()) with check (public.app_e_global());

-- Down Migration
drop table if exists public.config_plataforma;
