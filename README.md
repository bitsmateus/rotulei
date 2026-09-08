# Rotulei

SaaS multi-tenant de geração de placas de oferta para mercados. Escopo completo
em [ESCOPO.md](ESCOPO.md); decisões tomadas durante a construção em
[DECISOES.md](DECISOES.md); deploy em [DEPLOY.md](DEPLOY.md).

```
rotulei/
├─ packages/shared/     tipos e regras compartilhados (o objeto Cartaz mora aqui)
├─ apps/api/            NestJS + Postgres
│  ├─ db/migrations/    SQL puro — a fonte da verdade do schema
│  ├─ db/tests/         prova de isolamento no banco
│  └─ test/             testes de uso e segurança, por HTTP
└─ apps/web/            React + Vite + TS
```

## Subir do zero

Precisa de Node 24+ e Docker.

```bash
npm install
npm run db:up        # Postgres local na porta 5433
npm run db:setup     # cria as roles, migra e popula
npm run api:dev      # API em http://localhost:3333/api
npm run web:dev      # front em http://localhost:5173
```

O `.env` da raiz é compartilhado pelos dois apps. Copie de `.env.example` se ele
não existir.

### Contas do ambiente local

Todas com a senha `rotulei-dev-2026`:

| E-mail | Papel | Tenant |
|---|---|---|
| `admin@mercadonunes.com.br` | admin | Mercado Nunes |
| `operador@mercadonunes.com.br` | operador | Mercado Nunes (loja Central) |
| `admin@mercadovizinho.com.br` | admin | Mercado Vizinho |
| `super@nxdigital.com.br` | superadmin | — |

O Mercado Vizinho existe para que os testes de isolamento tenham um vizinho de
verdade: sem ele, "não vi nada" seria indistinguível de um banco vazio.

## Testes

```bash
npm test              # tudo
npm run test:api      # RLS no banco + uso e segurança por HTTP
npm run test:web      # motor de cartaz (fórmulas e renderização)
```

`npm run test:api` compila a API antes e sobe o artefato construído na porta
3399 — o que é testado é exatamente o que vai para produção.

## Como o multi-tenancy funciona

Um único Postgres, `tenant_id` em toda tabela de negócio, e **Row-Level Security**
como a fronteira real. Três coisas sustentam isso:

**1. A API nunca se conecta com uma role capaz de ignorar RLS.**

```
rotulei_owner   dona das tabelas, roda migrations.   A API NUNCA usa.
rotulei_app     a única role da API.                 Sem SUPERUSER, sem BYPASSRLS.
```

O boot verifica isso contra o catálogo do Postgres e **se recusa a subir** se a
conexão tiver privilégio demais. É o único erro de configuração do projeto que
não produz sintoma nenhum: tudo continuaria funcionando, só que um tenant
passaria a enxergar dados de outro.

**2. Toda query roda numa transação que carrega o contexto.**

```sql
set_config('app.tenant_id',  '<uuid>', true)
set_config('app.usuario_id', '<uuid>', true)
set_config('app.papel',      'admin',  true)
```

Sem contexto, `current_setting` devolve `NULL`, as políticas avaliam `NULL` (não
`TRUE`) e o acesso é negado. **O modo de falha é negar.**

**3. O `tenant_id` vem sempre do JWT assinado**, nunca de header, query ou body.
Se viesse do request, o cliente escolheria o próprio tenant e o RLS obedeceria.

O resultado é que um serviço como [cartazes.service.ts](apps/api/src/modules/cartazes/cartazes.service.ts)
não tem um único `where tenant_id = ...`. Não é esquecimento — é o ponto do
desenho. Uma query nova, escrita por alguém que nunca ouviu falar de tenant, já
nasce isolada.

### O caminho cross-tenant

`ContextoDbService.comoSistema(motivo, fn)` enxerga todos os tenants. É legítimo
para webhook do gateway, cadastro público e jobs. **Não existe JWT que produza
esse contexto** — ele só existe em código, e num lugar só.

## O motor de cartaz

Portado do MVP do Mercado Nunes **sem mudança de contrato**. As fórmulas de
dimensionamento, os 6 temas, as 9 fontes e as margens do preço vêm do handoff
técnico e já foram validadas com o cliente na gôndola.

Os testes em [motor.spec.ts](apps/web/src/features/cartaz/motor.spec.ts) travam
cada número contra regressão. Se um deles quebrar, ou o porte saiu errado ou
alguém "melhorou" uma fórmula que não devia mudar — em especial a margem de 56px
acima do preço, que parece exagerada e não é.

## Estado atual

| # | Item do checklist | Estado |
|---|---|---|
| 1 | Setup + schema multi-tenant com RLS | pronto |
| 2 | Motor de cartaz portado | pronto |
| 3 | Auth + papéis | pronto (API + login no front) |
| 4 | Cadastro público + trial | pronto, ponta a ponta |
| 5 | Integração Asaas | pronto, ponta a ponta — ver DECISOES.md #19 para confirmar |
| 6 | Painel superadmin | tenants/MRR/planos prontos; falta impersonar e central de ajuda |
| 7–9 | Painel do tenant, ajuda, melhorias | não começados |

## Trial, bloqueio e cobrança (itens 4, 5, 6-fatia)

Fluxo real, sem período de carência:

1. **Cadastro público** (`POST /public/cadastro`) cria o tenant em `trial`,
   sem pedir cartão, e já devolve os tokens — o admin entra direto. Pede
   também CPF e telefone do responsável: são a base da regra **um trial por
   pessoa** (`usuarios_cpf_uk` / `usuarios_telefone_uk`, únicos independente
   de CNPJ ou e-mail). CNPJ e CPF passam por dígito verificador de verdade
   (`packages/shared/src/documentos.ts`), não só contagem de dígitos. A rota
   tem limite de 5 tentativas/hora por IP (`LimitePorIpGuard`).
2. **`TrialService`** roda todo dia (e também ao subir o container) e vira
   `inadimplente` todo tenant em `trial` cujo prazo passou.
3. **`inadimplente` bloqueia o produto, não o login.** O JWT carrega
   `bloqueado: true`; toda rota de negócio responde **402**, exceto as
   marcadas `@PermiteQuandoBloqueado()` (auth, `/tenant/assinatura/*`).
4. O admin abre a tela de cobrança, chama `POST /tenant/assinatura/checkout` e
   é redirecionado para um link **hospedado no Asaas** — o Rotulei nunca vê
   número de cartão (DECISOES.md #19).
5. O Asaas confirma por webhook (`POST /webhooks/asaas`), que **nunca confia
   no corpo do evento**: sempre reconsulta a API do Asaas antes de liberar o
   tenant (DECISOES.md #22).

Credencial do Asaas fica cifrada no banco (AES-256-GCM), configurável pelo
superadmin em vez de variável de ambiente — DECISOES.md #17.

## Painel superadmin (item 6, parcial)

`/admin` (protegido por papel `superadmin`, que é redirecionado para lá
automaticamente ao logar — ele não tem tenant nem cartaz para editar):

- **Lista de tenants** com status, plano, quantidade de lojas, MRR calculado
  (`mensalidadeCentavos`, zero fora de `status='ativo'`) e próxima cobrança
  (estimada a partir do último pagamento confirmado quando o Asaas ainda não
  informou a data real).
- **Métricas agregadas** — MRR total, contagem por status.
- **Suspender/reativar manualmente** — o único caminho de mudança de status
  feito por uma pessoa (`tenants_protege_status` já barra qualquer outro).
  Mudar para `suspenso`/`cancelado` pede confirmação no navegador.
- **Planos** — preço, limite de lojas e se aparece no cadastro público,
  editáveis sem deploy (`GET`/`PATCH /admin/planos`).

Faltam impersonar tenant (ver a tela como o cliente vê, para suporte) e a
central de ajuda em vídeo — cada um com desenho próprio, ainda não iniciado.
