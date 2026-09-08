# Deploy no EasyPanel

Três serviços num projeto: `postgres`, `api` e `web`. O Postgres e a API ficam só
na rede interna; só o `web` recebe domínio público, e ele faz proxy de `/api`
para a API — assim não existe CORS nem URL de API diferente entre ambientes.

```
internet ──► web (nginx)  ──/api/──►  api (NestJS)  ──►  postgres
             domínio público          rede interna       rede interna
```

---

## 1. Serviço `postgres`

Template Postgres do EasyPanel. Anote usuário, senha e nome do banco — o usuário
criado pelo template é superusuário, e é ele que roda o bootstrap no passo 2.

Deixe **sem porta pública**. A API alcança pelo nome do serviço na rede interna.

Ligue o backup automático do EasyPanel apontando para um bucket. Um SaaS
multi-tenant sem backup é um incidente à espera de acontecer: o dado de todos os
clientes está no mesmo banco.

## 2. Bootstrap das roles — uma vez por ambiente

**Este passo é manual e não roda no deploy**, de propósito: ele precisa de um
usuário administrativo do Postgres, e nenhum container servido por HTTP deveria
ter essa credencial.

Do seu computador, com um túnel para o Postgres do EasyPanel (ou pelo console do
serviço), com o `.env` apontando para lá:

```bash
DATABASE_URL_ADMIN='postgres://<user_admin>:<senha>@<host>:5432/rotulei' \
ROTULEI_OWNER_PASSWORD='<senha forte>' \
ROTULEI_APP_PASSWORD='<outra senha forte>' \
npm run db:bootstrap
```

O script cria `rotulei_owner` e `rotulei_app`, aplica os privilégios e **verifica
contra o catálogo do Postgres** que `rotulei_app` não ficou com `SUPERUSER`,
`BYPASSRLS`, `CREATEDB` ou `CREATEROLE`. Se ficou, ele falha em vez de seguir.

Use senhas diferentes das do usuário administrativo. A `rotulei_app` é a que vai
dentro do container da API; a `rotulei_owner` só aparece na variável de migração.

## 3. Serviço `api`

- **Source:** este repositório
- **Build Context:** `/` (a raiz — o build precisa enxergar `packages/shared`)
- **Dockerfile:** `apps/api/Dockerfile`
- **Porta interna:** `3333`
- **Sem domínio público**

Variáveis de ambiente:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3333` |
| `DATABASE_URL` | `postgres://rotulei_app:<senha>@<serviço-postgres>:5432/rotulei` |
| `DATABASE_URL_MIGRATIONS` | `postgres://rotulei_owner:<senha>@<serviço-postgres>:5432/rotulei` |
| `JWT_SECRET` | gere: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ACCESS_TOKEN_MINUTOS` | `15` |
| `REFRESH_TOKEN_DIAS` | `30` |

**Não coloque `DATABASE_URL_ADMIN` aqui.** A API não precisa dela, e o container
não deveria ser capaz de criar roles.

O container roda `db:migrate` antes de subir a API — atualizar a versão já migra
o banco, sem depender de alguém lembrar.

### O check que impede o pior erro

Se `DATABASE_URL` apontar para `rotulei_owner` (ou para o superusuário) por
engano, **a API se recusa a subir** com a mensagem:

```
A API esta conectada como "rotulei_owner", que ignora Row-Level Security
(...). O isolamento entre tenants estaria DESLIGADO.
```

Esse é o único erro de configuração do projeto que não daria sintoma nenhum:
tudo continuaria funcionando, só que um tenant enxergaria dados de outro. Melhor
não subir do que subir vazando.

## 4. Serviço `web`

- **Build Context:** `/`
- **Dockerfile:** `apps/web/Dockerfile`
- **Porta interna:** `80`
- **Domínio público:** o do produto (Let's Encrypt via Traefik do EasyPanel)

| Variável | Valor |
|---|---|
| `API_UPSTREAM` | `http://<nome-do-serviço-api>:3333` |

O nome do serviço é o que o EasyPanel mostra na rede interna do projeto — confira
lá, porque ele costuma ser prefixado pelo nome do projeto.

## 5. Primeiro superadmin

O seed **não roda em produção** (ele cria dados de teste). Crie o superadmin uma
vez, direto no banco:

```sql
-- gere o hash antes:
-- node -e "require('argon2').hash('SENHA').then(console.log)"
insert into usuarios (nome, email, papel, senha_hash)
values ('Seu Nome', 'voce@nxdigital.com.br', 'superadmin', '<hash argon2id>');
```

Rode como `rotulei_owner` ou com contexto de sistema — a política de RLS impede
que um admin de tenant crie superadmin, que é justamente o objetivo.

Os planos também precisam existir. Extraia o bloco `PLANOS` de
`apps/api/db/scripts/seed.ts` ou insira à mão.

---

## Checklist antes de abrir para cliente

- [ ] `GET /api/saude` responde `"rlsAtivo": true` e `"roleDaApi": "rotulei_app"`
- [ ] `DATABASE_URL_ADMIN` **não** está nas variáveis do serviço `api`
- [ ] `JWT_SECRET` é diferente do usado em desenvolvimento
- [ ] Backup automático do Postgres ligado e testado (restaurar, não só gerar)
- [ ] Postgres e API sem porta pública
- [ ] Fontes `.otf` presentes em `apps/web/public/fonts/` (ver DECISOES.md)
