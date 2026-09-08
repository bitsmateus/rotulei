-- Up Migration
-- =============================================================================
-- CPF e telefone do usuario — nasce pelo cadastro publico (regra: "so um
-- trial por pessoa", nao por e-mail/CNPJ). CNPJ e e-mail ja sao unicos, mas
-- os dois sao triviais de trocar (novo e-mail, abrir outro CNPJ como MEI); o
-- CPF da pessoa por tras do cadastro e o identificador mais dificil de
-- multiplicar. Por isso a unicidade de verdade fica aqui, nao em tenants.
--
-- Nullable de proposito: um operador ou superadmin criado por um admin nao
-- precisa preencher isso — so quem passa pelo cadastro publico.
-- =============================================================================

alter table public.usuarios
  add column cpf text,
  add column telefone text;

alter table public.usuarios
  add constraint usuarios_cpf_formato check (cpf is null or cpf ~ '^[0-9]{11}$'),
  add constraint usuarios_telefone_formato check (telefone is null or telefone ~ '^[0-9]{10,11}$');

-- Indices parciais: unicidade so entre quem preencheu. Isso e o que impede a
-- MESMA pessoa (mesmo CPF) de abrir um segundo trial com e-mail/CNPJ novos.
create unique index usuarios_cpf_uk on public.usuarios (cpf) where cpf is not null;
create unique index usuarios_telefone_uk on public.usuarios (telefone) where telefone is not null;

-- Down Migration
drop index if exists public.usuarios_telefone_uk;
drop index if exists public.usuarios_cpf_uk;
alter table public.usuarios drop constraint if exists usuarios_telefone_formato;
alter table public.usuarios drop constraint if exists usuarios_cpf_formato;
alter table public.usuarios drop column if exists telefone;
alter table public.usuarios drop column if exists cpf;
