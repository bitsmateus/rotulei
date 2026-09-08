# Rotulei — Escopo do Produto

SaaS multi-tenant que transforma o gerador de placas do Mercado Nunes (hoje uma ferramenta interna, de um único
cliente, rodando em `/mercadonunes` dentro do app da NX Digital) num produto vendável para qualquer mercado do
Brasil: cadastro público, teste grátis, cobrança recorrente e ativação automática de cliente — sem a NX criar
nada manualmente.

Nome de trabalho: **Rotulei**. Outros candidatos considerados, caso queira revisitar: Gôndola, Precifica, Rotula,
Vitrine+, CartazApp, Tabloide, Placar, Etiquetai, Ofertaí, Placa Pronta, Oferta Certa, Cartaz Já, Preço na Hora.

## O que muda de verdade

O MVP original tem um objeto `Cartaz` e uma tabela de layouts sem dono — sem login, sem conceito de cliente. O
Rotulei precisa de `tenant`, `usuário`, `loja`, `plano` e `assinatura`, e de um fluxo que liga pagamento aprovado
→ conta ativa, sem ninguém da NX apertando um botão no meio.

## Quem usa

- **Superadmin** — papel de acesso total *dentro deste produto* (sem relação com superadmin de qualquer outro
  sistema da NX). Vê todos os tenants, MRR, trials em andamento, suspende/reativa contas, mexe em planos e
  cupons, alimenta a central de ajuda.
- **Admin do tenant** — dono/gerente do mercado. Cadastra lojas e operadores, define a marca (logo/cores), vê e
  troca o plano, gerencia a assinatura.
- **Operador de loja** — quem fica na gôndola. Só cria e imprime cartaz — sem acesso a cobrança, usuários ou
  configurações do tenant.

## Planos e preços

Referência de mercado (PriceFast, Ofertemais): faixa de R$100–200/mês para loja única. Entrar um degrau abaixo
pra ganhar tração, com anual descontado como todo o setor pratica.

| Plano | Preço | Escopo | Inclui |
|---|---|---|---|
| Início | R$89/mês (R$74/mês no anual) | 1 loja | Placas ilimitadas, 1 loja, usuários ilimitados, templates padrão + sazonais |
| Rede | R$69/loja/mês | 2 a 5 lojas (ex.: Mercado Nunes — Central + Vila Moema) | Tudo do Início + painel centralizado multi-loja + marca própria |
| Enterprise | Sob consulta | 6+ lojas | Tudo do Rede + integração PDV/ERP + gerente de conta |

Trial: 7 dias, sem pedir cartão no cadastro.

## Multi-tenancy

O MVP não tem conceito de cliente — uma tabela global, sem dono. Para muitos tenants pequenos (mercados de
bairro, não redes gigantes), schema por tenant não compensa — vira migração pra rodar em N bancos a cada
evolução do produto. A escolha correta: **um único banco Postgres**, toda tabela relevante carregando
`tenant_id`, e **Row-Level Security** garantindo que uma consulta de um tenant nunca enxergue linha de outro —
mesmo que uma query esqueça o filtro por engano.

Mecanismo: Tenant A e Tenant B acessam a mesma API (1 instância, todos os tenants); a API consulta o mesmo
Postgres; toda leitura/escrita passa por `WHERE tenant_id = :atual`, garantido via política de RLS — não por
lógica espalhada na aplicação.

## Modelo de dados

O objeto `Cartaz` do MVP entra praticamente inalterado — só ganha `tenant_id`, `loja_id` e `criado_por`. Novo:

```
tenants
  id, nome, cnpj, slug, status        // trial | ativo | inadimplente | suspenso | cancelado
  plano_id, trial_termina_em, criado_em

lojas
  id, tenant_id, nome, endereco

usuarios
  id, tenant_id, loja_id (nullable), nome, email, papel   // admin | operador

planos
  id, nome, preco_mensal, preco_anual, limite_lojas, recursos_jsonb

assinaturas
  id, tenant_id, plano_id, gateway_subscription_id, status, ciclo, proxima_cobranca_em

pagamentos
  id, tenant_id, assinatura_id, valor, metodo   // pix | boleto | cartao
  status, gateway_payment_id, pago_em

cartazes           // = Cartaz do MVP + escopo de tenant
  id, tenant_id, loja_id, criado_por, ...(campos do Cartaz original)

layouts_salvos      // = layouts do MVP, agora por tenant em vez de globais
  id, tenant_id, nome, patch, criado_em

videos_ajuda
  id, titulo, categoria, url_video, ordem
```

## Fluxo: trial → pagamento → tenant

Ninguém da NX cria conta de cliente na mão. O cadastro público já provisiona o tenant em trial; o gateway avisa
por webhook quando cobrar e quando confirmar — o backend só reage a esses dois eventos.

1. **Cadastro** (e-mail + CNPJ + plano escolhido) → cria tenant com `status=trial`, `trial_termina_em = +7 dias`.
   Acesso liberado na hora, sem pedir cartão.
2. **Dia 7** — sistema cobra automaticamente via Asaas, conforme o plano escolhido no cadastro.
3. **Webhook: pago** → `status=ativo`, assinatura recorrente confirmada, e-mail de boas-vindas.
4. **Webhook: recusado / sem pagamento** → `status=suspenso`, acesso bloqueado, dados retidos por 30 dias antes
   de purge.

O status do tenant nunca é setado por uma pessoa — só pelo cadastro público e pelos dois webhooks do gateway.

**Gateway recomendado: Asaas** — Pix, boleto e cartão recorrente nativos, e a NX já tem experiência de custo com
ele via Recorrai. Vale checar antes de começar se dá pra reaproveitar o motor de cobrança do próprio Recorrai em
vez de escrever assinatura/webhook do zero de novo.

## Superadmin

- Lista de tenants — status, plano, MRR, próxima cobrança
- Métricas: MRR total, trials em andamento, conversão trial → pago, churn
- Suspender/reativar tenant manualmente, aplicar cupom, trocar plano de um cliente específico
- Impersonar um tenant (ver a tela exatamente como o cliente vê, para suporte)
- Gerenciar planos — preço e limites editáveis sem precisar de deploy
- Gerenciar a central de ajuda (vídeos)

## Painel do tenant

- Cadastro de lojas e de operadores por loja (cobre o caso Nunes: Central + Vila Moema)
- Marca própria — logo e paleta aplicados automaticamente nos cartazes gerados
- Biblioteca de layouts salvos, agora isolada por tenant (no MVP era uma lista global)
- Assinatura — plano atual, faturas, forma de pagamento, upgrade/downgrade

## Central de ajuda (vídeos)

Aba dentro do painel do tenant com tutoriais curtos em vídeo — "como criar seu primeiro cartaz", "como trocar a
marca da loja", "como funciona a fila de impressão". O superadmin cadastra e ordena os vídeos (título, categoria,
link); não precisa de CDN de vídeo próprio no começo — um link do YouTube não-listado ou um arquivo no Supabase
Storage resolve.

## Herdado do MVP (Mercado Nunes)

Já construído, testado com o cliente, não precisa ser reprojetado — só portado com escopo de tenant. Detalhe
completo (fórmulas, armadilhas já resolvidas) no handoff técnico original:
https://claude.ai/code/artifact/4aa98800-3f2a-4115-ba5a-6de29fc6cd33

- Objeto `Cartaz` completo e o componente `CartazA4` (794×1123px, A4 real a 96dpi)
- Dimensionamento automático de texto (título/subtítulo encolhem conforme o tamanho do produto)
- 6 temas de cor, 9 fontes (licença já resolvida — ver seção de fontes do handoff)
- Preço grande com separação inteiro/vírgula/centavos + "bolinha" orgânica de fundo
- Blocos extras: "a partir de X un", avulso/caixa/valor por litro
- Fila de impressão e impressão direta via `window.print()` — sem geração de PDF no servidor

## Melhorias do roadmap comercial

O que separa "ferramenta de um cliente" de "produto que se vende sozinho":

1. **Importação em lote** via CSV/planilha — sem isso, mercado com centenas de SKU não usa
2. **Templates sazonais prontos** — Black Friday, Natal, Páscoa, aniversário da loja
3. **Disparo direto pro WhatsApp** — diferencial que nenhum concorrente do nicho tem, e é o core da NX
4. **Export quadrado** pra Instagram/Status, a partir do mesmo cadastro
5. **Agendamento** — data de início/fim da promoção
6. **Marca própria por tenant** — já coberta no painel do tenant acima

## Stack recomendada

| Peça | Escolha | Por quê |
|---|---|---|
| Backend | NestJS + Supabase (Postgres, Auth, Storage) | Mesmo padrão já validado em produção no Recorrai — reaproveita o playbook de deploy/ops |
| Frontend | React + Vite + TS | Reaproveita o componente `CartazA4` e a lógica de dimensionamento do MVP quase sem alteração |
| Hospedagem | EasyPanel | Mesmo ambiente do Recorrai |
| Pagamentos | Asaas | Pix/boleto/cartão recorrente nativos + webhooks; custo já mapeado pela NX |
| Impressão | CSS `@page` + `window.print()` | Zero dependência nova — é o que já funciona no MVP |

## Rotas da API (alto nível)

- `POST /public/cadastro` — cria tenant + usuário admin + assinatura em trial
- `POST /webhooks/asaas` — recebe confirmação/recusa de pagamento, atualiza status do tenant
- `GET /tenant/cartazes` — lista cartazes do tenant autenticado
- `POST /tenant/cartazes` — cria cartaz, mesmo contrato do objeto Cartaz original
- `POST /tenant/cartazes/importar` — importação em lote via CSV/planilha
- `GET /tenant/layouts` — layouts salvos do tenant
- `PATCH /tenant/lojas/:id` — edita loja/branding
- `GET /admin/tenants` — superadmin, lista com status/plano/MRR
- `PATCH /admin/tenants/:id/status` — superadmin, suspender/reativar manualmente

## Fases de implementação

0. **Fundação** — multi-tenancy de ponta a ponta antes de qualquer venda: schema multi-tenant, auth + papéis,
   porte do componente `CartazA4` e da lógica do MVP.
1. **Autoatendimento** — um mercado consegue se cadastrar e pagar sem falar com ninguém da NX: cadastro público,
   trial de 7 dias, integração Asaas (checkout + webhooks), ativação/suspensão automática de tenant.
2. **Produto** — o que faz o cliente ficar: importação em lote, templates sazonais, marca própria por tenant,
   central de ajuda com vídeos.
3. **Crescimento** — o que justifica o plano Enterprise: disparo de oferta via WhatsApp, agendamento de
   validade, integração com PDV/ERP.

## Checklist — ordem sugerida (cada item depende do anterior estar de pé)

1. Setup do projeto — NestJS + Supabase, schema inicial (tenants, usuarios, lojas, planos)
2. Portar o motor de cartaz — `CartazA4`, dimensionamento, temas e fontes do MVP
3. Auth + papéis — superadmin, admin do tenant, operador; RLS por `tenant_id` em toda tabela
4. Cadastro público + trial — cria tenant em trial, sem pedir cartão
5. Integração Asaas — checkout no fim do trial, webhook de pago/recusado, ativação/suspensão automática
6. Painel superadmin — lista de tenants, MRR, ações manuais
7. Painel do tenant — lojas, usuários, marca própria
8. Central de ajuda — vídeos por categoria, gerenciados pelo superadmin
9. Melhorias de produto — lote, sazonais, WhatsApp, agendamento (Fases 2 e 3)

---
Escrito a partir do handoff técnico do MVP (Mercado Nunes / NX Digital) e da conversa de precificação de
08/09/2026. Ponto de partida da Fase 0.
