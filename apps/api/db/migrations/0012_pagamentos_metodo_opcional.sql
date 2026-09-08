-- Up Migration
-- =============================================================================
-- O checkout do Asaas roda com `billingType: UNDEFINED` — o Rotulei nunca
-- pede a forma de pagamento, quem escolhe Pix/boleto/cartao e o proprio tenant
-- na pagina hospedada do Asaas. Ate essa escolha, o metodo do pagamento e
-- desconhecido; a coluna precisa aceitar isso.
-- =============================================================================

alter table public.pagamentos alter column metodo drop not null;

-- Down Migration
-- Reverter exige que nao haja linha com metodo nulo — se houver, a migration
-- down falha de proposito (nao existe metodo correto para inventar aqui).
alter table public.pagamentos alter column metodo set not null;
