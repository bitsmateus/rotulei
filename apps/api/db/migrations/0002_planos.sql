-- Up Migration

-- Planos sao dados globais (nao tem tenant_id): todo tenant enxerga o catalogo,
-- so o superadmin edita. O escopo pede preco editavel "sem precisar de deploy".
create table public.planos (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null,
  nome                  text not null,

  -- Dinheiro em CENTAVOS (integer). Float acumula erro de arredondamento e
  -- vira divergencia de centavo no fechamento de fatura.
  preco_mensal_centavos integer not null,
  preco_anual_centavos  integer,

  -- O plano "Rede" cobra R$69 POR LOJA/mes; "Inicio" cobra valor fixo.
  -- Sem esta flag o MRR do painel superadmin sai errado para redes.
  preco_por_loja        boolean not null default false,

  -- null = sem limite (Enterprise).
  limite_lojas          integer,

  recursos              jsonb not null default '{}'::jsonb,
  ativo                 boolean not null default true,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),

  constraint planos_codigo_formato check (codigo ~ '^[a-z0-9-]{2,30}$'),
  constraint planos_preco_mensal_nao_negativo check (preco_mensal_centavos >= 0),
  constraint planos_preco_anual_nao_negativo check (preco_anual_centavos is null or preco_anual_centavos >= 0),
  constraint planos_limite_lojas_positivo check (limite_lojas is null or limite_lojas > 0)
);

create unique index planos_codigo_uk on public.planos (codigo);

create trigger planos_touch
  before update on public.planos
  for each row execute function public.touch_atualizado_em();

-- Down Migration
drop table if exists public.planos;
