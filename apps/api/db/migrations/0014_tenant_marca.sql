-- Up Migration
-- =============================================================================
-- Marca propria do tenant (item 7, ESCOPO.md secao "Painel do tenant"): logo e
-- paleta aplicados automaticamente nos cartazes gerados.
--
-- Sem Supabase Storage (decisao ja tomada: EasyPanel + Postgres self-hosted) e
-- sem MinIO/S3 configurado ainda, o logo entra como data URL (base64) direto
-- na coluna — arquivo pequeno (poucos KB, e um logo de mercado, nao foto), sem
-- infra nova. Ver DECISOES.md para o numero exato do teto de tamanho, que fica
-- na camada de validacao do DTO (o banco so confere o FORMATO, nao o tamanho).
--
-- Cor fica em `tenants`, nao em `lojas`: e a marca do NEGOCIO, nao de uma loja
-- especifica — ESCOPO.md fala em "marca propria" no nivel do admin do tenant.
-- =============================================================================

alter table public.tenants
  add column logo_data_url text,
  add column cor_primaria text,
  add column cor_secundaria text;

alter table public.tenants
  add constraint tenants_logo_formato
    check (logo_data_url is null or logo_data_url ~ '^data:image/(png|jpeg|webp);base64,'),
  add constraint tenants_cor_primaria_formato
    check (cor_primaria is null or cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  add constraint tenants_cor_secundaria_formato
    check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-fA-F]{6}$');

-- Down Migration
alter table public.tenants drop constraint if exists tenants_cor_secundaria_formato;
alter table public.tenants drop constraint if exists tenants_cor_primaria_formato;
alter table public.tenants drop constraint if exists tenants_logo_formato;
alter table public.tenants drop column if exists cor_secundaria;
alter table public.tenants drop column if exists cor_primaria;
alter table public.tenants drop column if exists logo_data_url;
