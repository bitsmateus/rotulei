# Rotulei — notas para quem for mexer no código

Leia [ESCOPO.md](ESCOPO.md) para o produto e [DECISOES.md](DECISOES.md) para o
que foi decidido e por quê. Este arquivo é só o que evita erro na hora de editar.

## Regras que não são estilo

**1. Nenhum serviço de domínio escreve `where tenant_id = ...`.**
O isolamento vem do RLS, não da aplicação. Se você sentir vontade de adicionar
esse filtro "por segurança", o que está faltando é contexto de sessão, não um
`where`. Veja `cartazes.service.ts`.

**2. Toda query passa pelo `ContextoDbService`.**
`set_config(..., true)` só vale dentro de transação. Uma query fora daí roda sem
contexto e não vê linha nenhuma — o modo de falha é negar, mas o sintoma vai
parecer "sumiu tudo".

**3. `comoSistema()` tem dois usos legítimos: cross-tenant, e config de plataforma.**
Não existe JWT que produza o contexto `sistema`. Se você precisar dele numa rota
autenticada para ler/escrever dado de TENANT, o desenho está errado — para
superadmin existe o papel `superadmin`, que passa pelo guard normal. A exceção é
ler `config_plataforma` (credencial do Asaas): isso não é dado de tenant nenhum,
é config global que o serviço lê em nome de quem chamou — `ConfigPlataformaService.
obterCredenciais()` faz isso de propósito, e nunca deve devolver o valor decifrado
por um controller.

**3a. `bloqueado` vem do JWT, não de uma consulta por request.**
Um tenant inadimplente (Opção B — DECISOES.md #18) ainda consegue logar; o que
fecha é o acesso às rotas de negócio, via `claims.bloqueado` checado no
`AuthGuard`. Igual ao resto do token, fica desatualizado por até
`ACCESS_TOKEN_MINUTOS` — não adicione um SELECT por request para "corrigir"
isso, é a mesma folga que já existia para suspensão via webhook.

**4. `DATABASE_URL` aponta para `rotulei_app`, sempre.**
Apontar para o owner desliga o RLS sem gerar erro nenhum. O boot checa isso e se
recusa a subir.

**5. O motor de cartaz é porte, não reprojeto.**
As fórmulas em `packages/shared/src/cartaz.ts` vieram do handoff do MVP, validadas
com o cliente na gôndola. Em especial a margem de 56px acima do preço: ela parece
exagerada e não é — foi medida no pior caso. `motor.spec.ts` trava cada número.

## Armadilhas do ambiente

- **A API é ESM.** Import relativo precisa de `.js`, mesmo apontando para `.ts`.
- **Não troque o runner de dev por `tsx`.** esbuild não emite
  `emitDecoratorMetadata` e a injeção de dependência do Nest quebra em silêncio
  (todo endpoint vira 500).
- **TypeScript fica na 6** até a 7.1 devolver a API do compilador.
- **`npm test` compila antes.** Os testes rodam contra `dist/`, não contra o
  fonte, pelo mesmo motivo do item acima.
- Portas locais: API `3333`, Postgres `5433`, Vite `5173`.

## Nomes

Domínio em português (`tenant`, `loja`, `cartaz`, `papel`, `criadoEm`), porque é
o vocabulário do cliente e do escopo. Termos técnicos ficam em inglês onde já são
nome próprio (`refresh token`, `RLS`, `commit`).

Colunas do banco em `snake_case`; o mapeamento para `camelCase` acontece na
borda, no service.

## Antes de abrir PR

```bash
npm test          # RLS no banco + uso/segurança por HTTP + motor de cartaz
npm run build     # api e web
```

Se você mexeu em migration, rode `npm run db:reset && npm run db:setup` para
garantir que o schema sobe do zero — não só incrementalmente.
