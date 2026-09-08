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
| 4 | Cadastro público + trial | não começado |
| 5 | Integração Asaas | bloqueado — ver DECISOES.md |
| 6–9 | Painéis, ajuda, melhorias | não começados |
