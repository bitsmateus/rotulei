-- Up Migration
-- =============================================================================
-- Sessoes (refresh tokens) — sem Supabase Auth, isto e nosso.
--
-- Modelo: access token JWT curto (15 min, nao fica no banco) + refresh token
-- opaco e longo, guardado aqui em HASH. Guardar o token em claro seria dar a
-- quem lesse um dump do banco a capacidade de assumir qualquer sessao.
--
-- Rotacao: cada uso do refresh emite um novo e marca o antigo como substituido.
-- Se um token JA substituido for apresentado de novo, isso significa que ele
-- vazou (o dono legitimo ja rodou a rotacao) — e a familia inteira de sessoes
-- daquele usuario e revogada.
-- =============================================================================

create table public.sessoes (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.usuarios (id) on delete cascade,

  -- Desnormalizado de proposito: o refresh precisa montar o contexto de sessao
  -- sem antes conseguir ler `usuarios` (que e protegida por RLS por tenant).
  tenant_id      uuid references public.tenants (id) on delete cascade,

  -- sha256 do token em claro. O token em si nunca toca o banco.
  token_hash     text not null,

  -- Sessoes emitidas a partir desta. Cadeia usada para detectar reuso.
  substituida_por uuid references public.sessoes (id) on delete set null,

  expira_em      timestamptz not null,
  revogada_em    timestamptz,
  motivo_revogacao text,

  -- Trilha para o usuario reconhecer "aquele login que nao fui eu".
  user_agent     text,
  ip             inet,

  criado_em      timestamptz not null default now(),
  usada_em       timestamptz,

  constraint sessoes_hash_formato check (token_hash ~ '^[0-9a-f]{64}$')
);

create unique index sessoes_token_hash_uk on public.sessoes (token_hash);
create index sessoes_usuario_idx on public.sessoes (usuario_id);
create index sessoes_expiracao_idx on public.sessoes (expira_em) where revogada_em is null;

-- =============================================================================
-- RLS
--
-- Login e refresh sao operacoes SEM tenant conhecido: so depois de achar o
-- usuario e que se sabe de qual tenant ele e. Por isso o AuthService roda no
-- contexto 'sistema' — e um dos poucos usos legitimos do caminho cross-tenant.
--
-- A politica abaixo garante que, fora desse caminho, um tenant so enxerga as
-- proprias sessoes; e nenhum papel de usuario consegue ler as dos outros.
-- =============================================================================
alter table public.sessoes enable row level security;
alter table public.sessoes force  row level security;

create policy sessoes_leitura on public.sessoes
  for select using (
    public.app_e_global()
    or usuario_id = public.app_usuario_id()
  );

create policy sessoes_escrita_sistema on public.sessoes
  for all using (public.app_e_global()) with check (public.app_e_global());

-- Encerrar a propria sessao (logout) nao precisa do contexto de sistema.
create policy sessoes_revogar_proprias on public.sessoes
  for update using (usuario_id = public.app_usuario_id())
           with check (usuario_id = public.app_usuario_id());

-- =============================================================================
-- Senha obrigatoria para quem faz login.
--
-- A coluna nasceu nullable em 0005 porque ainda nao havia auth. Agora que
-- existe, um usuario sem hash e um usuario que nunca conseguira entrar — mas
-- convites (usuario criado pelo admin, senha definida depois) sao um fluxo real
-- do produto, entao a coluna segue nullable e quem valida e o login.
-- =============================================================================
comment on column public.usuarios.senha_hash is
  'argon2id. NULL = convite pendente: o usuario existe mas ainda nao definiu senha.';

-- Down Migration
drop table if exists public.sessoes;
