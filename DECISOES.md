# Decisões tomadas sem confirmação

Você disse para decidir e deixar anotado. Cada item abaixo é uma escolha que fiz
sozinho na noite de 07→08/09/2026, com o porquê e o custo de reverter. Nada aqui
é irreversível sem aviso — onde reverter é caro, está marcado.

---

## 1. TypeScript fixado na versão 6, não na 7

**Por quê:** a TS 7.0 removeu a API programática do compilador. O CLI do NestJS
depende dela e falha com uma mensagem explícita dizendo que ela volta na 7.1.

**Custo de reverter:** nenhum. Quando a 7.1 sair, é subir a versão e rodar o
build. Sem mudança de código.

---

## 2. A API é ESM (`"type": "module"`), não CommonJS

**Por quê:** o NestJS 12 é distribuído só como ESM — CommonJS não consegue nem
importar `@nestjs/common`. Não é preferência, é requisito da versão.

**Consequência prática:** todo import relativo carrega a extensão `.js`
(`import { env } from './config/env.js'`), mesmo apontando para um `.ts`. É
exigência do resolver `node16` e vai parecer estranho à primeira leitura.

---

## 3. Dev roda com o compilador do Nest, não com `tsx`

**Por quê:** o `tsx` usa esbuild, que não emite `emitDecoratorMetadata`. Sem isso
a injeção de dependência do NestJS entrega `undefined` no construtor — a API
subia e todo endpoint dava 500. Levei um tempo achando isso; está registrado aqui
para ninguém trocar o runner de volta sem saber.

Onde `tsx` continua: nos scripts de banco (`bootstrap`, `migrate`, `seed`), que
não usam decorator.

---

## 4. Testes rodam contra o artefato compilado, não contra o código-fonte

**Por quê:** mesma raiz do item 3 — o vitest também transpila com esbuild. Em vez
de adicionar mais uma ferramenta (SWC) só para os testes, o `globalSetup` sobe
`dist/main.js` numa porta de teste (3399) e a suíte bate HTTP nele.

**Efeito colateral bom:** o que é testado é exatamente o que vai para o
EasyPanel, decoradores, pipes de validação e tudo mais.

**Efeito colateral ruim:** `npm test` roda `npm run build` antes (uns 4s a mais).

---

## 5. `cartazes` usa colunas reais; `layouts_salvos` continua com JSONB

**Por quê:** o MVP usou JSONB em `patch` porque os campos de *estilo* ainda
estavam crescendo. Esse contrato agora está fechado, e o roadmap comercial pede
coisas que só funcionam com coluna de verdade: importação em lote via CSV,
agendamento por data de validade e busca por produto.

`layouts_salvos` mantém `patch` JSONB, como no MVP — ali o schema livre continua
sendo a escolha certa.

**Custo de reverter:** uma migração. Vale conversar antes de eu seguir para o
item 4.

---

## 6. Preços em centavos (inteiro), e `preco_por_loja` no plano

Duas coisas que não estavam explícitas no escopo:

- **Centavos como `integer`.** Dinheiro em ponto flutuante acumula erro de
  arredondamento e vira divergência de centavo no fechamento de fatura.
- **`preco_por_loja boolean` na tabela `planos`.** O escopo diz "Rede —
  R$69/**loja**/mês" e "Início — R$89/mês". São modelos de cobrança diferentes.
  Sem essa flag, o MRR do painel superadmin sairia errado para toda rede.

---

## 7. Papel `sistema`: o único caminho cross-tenant

Além dos três papéis do escopo (`superadmin`, `admin`, `operador`), existe um
quarto contexto: `sistema`. **Ele nunca é emitido em JWT** — não existe token
capaz de virar contexto cross-tenant. Só existe em código, via
`ContextoDbService.comoSistema(motivo, fn)`.

Usos legítimos hoje: login e refresh (não se sabe o tenant antes de achar o
usuário), e o seed. Usos futuros: webhook do Asaas e o cadastro público.

---

## 8. O status do tenant é protegido por trigger, não só por política

O escopo é explícito: "o status do tenant nunca é setado por uma pessoa". A
política de RLS deixa o admin editar nome e CNPJ do próprio tenant, mas um
trigger recusa qualquer mudança de `status` fora do contexto `sistema`/
`superadmin`. Sem ele, um tenant suspenso se reativaria sozinho pelo painel.

---

## 9. Senha mínima de 10 caracteres, sem exigência de complexidade

Recomendação atual da OWASP. Exigir maiúscula + número + símbolo empurra o
usuário para `Senha@123`, que é pior que uma senha longa e simples.

---

## 10. Detecção de reuso de refresh token derruba **todas** as sessões

Se um refresh já rotacionado for apresentado de novo, ele vazou. Como não dá para
saber qual das duas partes é o atacante, a família inteira de sessões do usuário
é revogada e o login é exigido de novo.

**É uma escolha de produto, não só técnica:** o usuário legítimo é deslogado de
todos os dispositivos. Se você achar agressivo demais para um operador de
gôndola, dá para suavizar — mas a alternativa deixa o atacante dentro.

---

## 11. Porta 3333 para a API, 5433 para o Postgres local

A 3000 já está ocupada na sua máquina pelo portal E. Ferreira, e a 5432 pelo
container `eferreira-banco`. Só afeta o ambiente local.

---

## 12. O frontend fala com a API pelo mesmo domínio

Em dev, o Vite faz proxy de `/api` para a porta 3333. Em produção, o nginx do
container do frontend faz `proxy_pass` para o serviço da API. Assim não existe
CORS, nem URL de API diferente entre os ambientes.

**Depende de:** no EasyPanel, o domínio público aponta para o serviço `web`, e o
serviço `api` fica só na rede interna. Se você preferir dois domínios separados,
me avise que eu troco por CORS configurado.

---

## 13. Nove fontes, não sete

O handoff técnico do MVP se contradiz: o texto diz "7 opções de fonte" e a tabela
logo abaixo lista 9. O escopo do Rotulei também diz 9. Fui com **9** (3
self-hosted + 6 do Google).

---

## 14. Refresh token no `localStorage` — a revisitar antes de abrir para cliente

**Como está:** o access token fica só em memória (some ao recarregar) e o refresh
token no `localStorage`, porque precisa sobreviver ao reload.

**O risco:** `localStorage` é alcançável por XSS. Se alguém conseguir injetar
script na página, leva o refresh token junto.

**A alternativa mais forte** é o refresh em cookie `httpOnly` + `SameSite`, que
JavaScript nenhum consegue ler. O custo é que a API passa a precisar de proteção
contra CSRF, porque o cookie viaja sozinho em toda requisição.

**Por que não fiz agora:** é uma mudança que atravessa API e front, e você não
estava por perto para decidir. O access token de 15 minutos limita a janela
enquanto isso. **Marquei como item a resolver antes do primeiro cliente pagante**
— não é algo para descobrir depois que houver dado de mercado real no banco.

---

## 15. Uma renovação de token por vez, compartilhada entre requests

Se cinco chamadas expirarem juntas, elas compartilham a mesma promessa de
refresh. Sem isso, as cinco disparariam refresh em paralelo e as quatro
perdedoras apresentariam um token já rotacionado — que a API interpreta,
corretamente, como vazamento, e derrubaria a sessão inteira do usuário.

É o tipo de bug que só aparece com a rede lenta e a aba aberta há tempo.

---

## 16. A verificação de boot cobre quatro formas de furar o RLS, não uma

Minha primeira versão dessa checagem só olhava `SUPERUSER` e `BYPASSRLS` em
`pg_roles`. Testei subindo a imagem apontada para `rotulei_owner` de propósito, e
**ela subiu** — porque a dona das tabelas não tem nenhum dos dois atributos.

Ela não ignora o RLS enquanto o `FORCE` estiver ligado (verifiquei: vê 0 linhas
sem contexto). Mas ela pode desligar:

```sql
alter table cartazes no force row level security;   -- uma linha
select count(*) from cartazes;                       -- passa a ver os 2 tenants
```

Ou seja: apontar `DATABASE_URL` para a conexão das migrations transforma qualquer
injeção de SQL em leitura completa do banco de todos os clientes. E é o erro mais
fácil de cometer, porque as duas URLs ficam lado a lado no painel do EasyPanel.

A checagem agora recusa: superuser, `BYPASSRLS` direto, `BYPASSRLS` herdado por
participação em outra role, `CREATEROLE`, e **ser dona de qualquer tabela**.
`db/tests/role-segura.spec.ts` cobre os quatro casos, e há um teste separado
confirmando que toda tabela de negócio tem RLS *habilitado e forçado* — `enable`
sem `force` é exatamente o buraco que deixaria a dona passar.

---

## 17. Credenciais do Asaas ficam no banco, editáveis pelo superadmin

**Decisão sua (08/09/2026):** o token do Asaas é cadastrado dentro da ferramenta,
na área do superadmin — não numa variável de ambiente do EasyPanel.

**O que isso ganha:** trocar o token (rotação, migrar de sandbox para produção,
o Asaas revogar a chave) vira um formulário, não um redeploy. Quem opera a NX não
precisa de acesso ao painel de infraestrutura para mexer em cobrança.

**O que isso obriga, e não é opcional:**

1. **Cifrado em repouso.** Um token do Asaas movimenta dinheiro. Guardar em texto
   puro significa que um dump do banco — backup vazado, acesso de leitura mal
   configurado — entrega a conta de cobrança junto. Fica cifrado com AES-256-GCM.
2. **A chave de cifra vem do ambiente** (`CONFIG_SECRET`), nunca do banco. É o que
   faz o dump sozinho não bastar: sem a chave do container, o valor cifrado é
   inútil. Também significa que perder essa variável é perder os tokens — vai
   para o DEPLOY.md como item de backup.
3. **O token nunca volta pela API.** A tela do superadmin mostra só se está
   configurado, o ambiente (sandbox/produção) e os últimos 4 caracteres. Não
   existe endpoint que devolva o valor inteiro — nem para superadmin. Ele
   escreve um novo se precisar trocar.
4. **Trilha de auditoria.** Quem trocou e quando. Se uma cobrança sair errada,
   essa é a primeira pergunta.
5. **Sandbox e produção separados.** O Asaas tem ambientes distintos com tokens
   distintos. Guardar os dois evita o acidente clássico de testar contra a conta
   real.

**Consequência de sequência:** a parte de configuração do **item 6 (painel
superadmin) passa a vir antes do item 5 (Asaas)** — não dá para integrar o
gateway antes de existir onde guardar a credencial. É uma fatia pequena do item
6 (uma tela de configurações), não o painel inteiro.

---

## 18. Fim do trial: bloqueia o acesso e pede cartão dentro do app (Opção B)

**Decisão sua (08/09/2026):** resolve a contradição do escopo entre "trial sem
cartão" e "cobrança automática no dia 7". No dia 7, o acesso é bloqueado — o
tenant não desaparece, só para de conseguir usar — e o próprio app pede o cartão
para liberar de novo.

**Como isso muda o desenho:**

- **`status='trial'` vira `status='inadimplente'` no dia 7.** Redefini
  `'inadimplente'` para cobrir dois casos com o mesmo tratamento — trial vencido
  sem cartão, e cobrança recorrente recusada — porque nos dois o app pede o
  cartão para voltar a `'ativo'`. `'suspenso'` fica reservado para ação MANUAL do
  superadmin (suporte, fraude, pedido do cliente): é uma decisão humana, não o
  sistema reagindo a falta de pagamento. **`STATUS_COM_ACESSO` mudou** de
  `['trial', 'ativo', 'inadimplente']` para `['trial', 'ativo']` — a versão
  anterior estava errada para a Opção B: um tenant inadimplente não pode ter
  acesso, senão o bloqueio não bloqueia nada.
- **Um job diário** (não um webhook) varre tenants com `trial_termina_em` vencido
  e muda o status. Não existe evento externo que dispare isso — é o relógio.
- **A tela de bloqueio pede o cartão** e cria a assinatura recorrente no Asaas na
  hora. Aprovado → `status='ativo'`. Recusado → continua `inadimplente`, tenta de
  novo.
- **Sem período de carência**: o corte é no dia 7, não "dia 7 mais alguns dias de
  tolerância". Se quiser um colchão depois de ver os primeiros trials reais, é
  mudar um número, não redesenhar o fluxo.

**Por que não a Opção A (Pix/boleto por e-mail):** cobrança fora do app depende do
cliente agir sem estar olhando para o produto — pior conversão para um SaaS de
ticket baixo como este. Bloquear dentro do app captura a intenção no momento em
que ela existe.
gateway antes de existir onde guardar a credencial dele. É uma fatia pequena do
item 6 (uma tela de configurações), não o painel inteiro.

---

# Pendências resolvidas em 08/09/2026

- **Fluxo de fim de trial** → Opção B (decisão #18): bloqueia e pede cartão no app.
- **Decisões #5, #10, #14** → confirmadas como estão.
- **Repositório do Recorrai** → `https://github.com/bitsmateus/recorra`, para
  checar se o motor de cobrança dá para reaproveitar.
- **Repositório do Rotulei** → `https://github.com/bitsmateus/rotulei.git`.

# Pendências que ainda dependem de você

## Os arquivos `.otf` das fontes não estão no repositório

`masters-black.otf`, `masters-birds.otf` e `masters-rough-thin.otf` precisam ser
copiados do MVP para `apps/web/public/fonts/`. Sem eles o cartaz renderiza com a
fonte de fallback do sistema — funciona, mas não fica igual ao do cliente.

Junto vem o `LICENSE-masters.txt`. **Lembrete de licença:** só o corte gratuito
(SIL OFL) da TT Masters pode ser embutido; a família completa da TypeType é paga.

## A logo do Mercado Nunes também não está

Você confirmou que ainda não tem esse arquivo. O `CartazA4` aceita `logoUrl`;
hoje nada é passado, então o bloco da logo não aparece. Vai ser resolvido de
verdade no item 7 (marca própria por tenant), quando cada tenant tiver a sua.

---

# Itens 4, 5 e a fatia de configuração do item 6 — 08/09/2026

Construídos na mesma sessão, na sequência: config do Asaas → cadastro público →
job de fim de trial → checkout → webhook. 159 testes (125 API + 34 web), banco
recriado do zero.

## 19. Checkout hospedado no Asaas — o Rotulei nunca toca em cartão

A assinatura é criada com `billingType: UNDEFINED`: o Asaas devolve um link
(`invoiceUrl`) onde o **próprio tenant** escolhe Pix/boleto/cartão numa página
do Asaas. O Rotulei nunca recebe um número de cartão.

**Por quê, e o que isso custa:** a alternativa — um formulário de cartão dentro
do Rotulei — colocaria o produto em escopo de PCI-DSS (a auto-avaliação SAQ D,
a mais pesada: exige segmentação de rede, varredura trimestral, etc.). Com
checkout hospedado, o Rotulei fica em SAQ A (o mais leve: nunca vê, processa ou
armazena dado de cartão). O custo é UX: o tenant sai do app e entra numa página
do Asaas para pagar, em vez de preencher um campo de cartão sem sair da tela de
bloqueio. Dado que "pede cartão dentro do app" (sua instrução) pode ser lido
como "o app conduz o fluxo, sem ir para fora" — o que a implementação faz — ou
como "um campo de cartão embutido na própria tela" — o que eu **não** fiz —
**esta é uma decisão que vale sua confirmação explícita.** Se você quiser o
campo embutido, é trocar o `billingType` e adicionar tokenização de cartão no
frontend (o Asaas oferece isso), mas o produto passa a carregar escopo de PCI.

## 20. O JWT carrega `bloqueado`, não é um guard que consulta o banco a cada request

Antes desta sessão, um tenant fora de `STATUS_COM_ACESSO` era barrado no
**login**. Isso quebraria a Opção B: o admin precisa conseguir entrar para
pagar. A correção foi separar duas coisas que estavam juntas:

- `STATUS_QUE_PODE_LOGAR` (`trial`, `ativo`, `inadimplente`) — decide se o
  login é aceito. `suspenso` e `cancelado` continuam bloqueando o login por
  inteiro (são decisão humana ou fim de linha; não há autoatendimento).
- `bloqueado: boolean` no JWT — decide se as rotas de negócio respondem 402.
  Calculado uma vez, no login/refresh, e carregado no token — **não** é
  recalculado a cada request. Um `BloqueioInadimplenciaGuard` (na prática,
  incorporado ao `AuthGuard` existente) rejeita com 402 qualquer rota que não
  esteja marcada `@PermiteQuandoBloqueado()`.

**Por que não checar o banco a cada request:** o projeto já tinha esse
compromisso — o comentário original em `renovar()` dizia "revalida o tenant a
cada renovação: é o que faz um tenant suspenso pelo webhook perder o acesso em
até 15 minutos". Ou seja, uma janela de defasagem de até
`ACCESS_TOKEN_MINUTOS` já era aceita antes de eu mexer em nada. Estender essa
mesma folga para o bloqueio por inadimplência é consistente, não uma
concessão nova — e evita uma consulta ao banco em toda chamada autenticada.

**Teste que prova a folga:** `test/bloqueio.e2e.spec.ts` — o access token
emitido durante o cadastro (quando o tenant ainda era `trial`) continua
respondendo `bloqueado: false` mesmo depois do banco já dizer
`inadimplente`; só o próximo `refresh` reflete a mudança.

## 21. `pagamentos.metodo` é opcional — migration 0012

Consequência direta do checkout sem forma definida (decisão #19): no momento
em que o Rotulei cria a cobrança, ainda não se sabe se o tenant vai pagar via
Pix, boleto ou cartão — só o Asaas sabe, depois que a pessoa escolhe na página
dele. A coluna nasceu `NOT NULL` na migration 0011 (antes de eu perceber essa
implicação ao implementar o cliente); a 0012 corrige com uma migration nova,
não reescrevendo a 0011 — a mesma disciplina que o resto do projeto já segue
para todo schema que passou a existir de verdade em algum ambiente.

## 22. Webhook nunca confia no corpo — sempre reconsulta a API do Asaas

Padrão trazido do Recorrai (mesmo problema resolvido antes, no motor de
cobrança que você me indicou para checar). Um corpo de webhook pode ser
forjado por qualquer um que descubra a URL; a resposta de uma consulta
autenticada com a própria API key do Rotulei, não. O
`AsaasWebhookService.processar` extrai só o `payment.id` do corpo e usa isso
como uma pista de "vá conferir" — o status real, o método de pagamento e o
valor vêm sempre de `GET /payments/{id}`.

O token do webhook (`asaas-access-token`) é conferido, mas só para **log**: se
não bater, o evento não é descartado — só gera um aviso e segue para a
reconfirmação via API. Um webhook mal configurado no painel do Asaas não pode
virar "pagamento confirmado nunca chega", que seria pior que aceitar demais.

## 23. Renovação recusada reusa o mesmo fluxo do fim de trial

O ESCOPO.md original previa `status=suspenso` para "webhook: recusado/sem
pagamento". Com a Opção B, simplifiquei: **qualquer** falha de cobrança —
trial vencido ou renovação recusada — leva a `inadimplente`, o mesmo estado,
com o mesmo caminho de desbloqueio (entrar e pagar). `suspenso` fica só para
ação manual do superadmin.

**O que isso NÃO cobre, de propósito, por ora:** não há régua de cobrança
(tentar de novo em X dias antes de bloquear), nem período de carência depois
de uma renovação recusada — o bloqueio é imediato no primeiro evento `VENCIDA`.
Se isso for agressivo demais na prática (cartão que falha uma vez por
oscilação do banco emissor, por exemplo), é ajuste no
`AsaasWebhookService`, não redesenho.

---

# Pendências novas que dependem de você

## Confirmar a decisão #19 (checkout hospedado vs. campo de cartão embutido)

Veja o texto completo acima. Fiz a escolha de menor risco/custo de compliance
sem poder confirmar com você primeiro — é a que eu recomendaria, mas quero seu
aval antes de considerar o item 5 fechado de verdade.

## Cadastro público sem limite de tentativas

`POST /public/cadastro` é uma rota pública e sem esse limite, alguém pode
escrever um script e criar centenas de tenants em trial. Não implementei
rate-limiting nesta sessão (adicionar `@nestjs/throttler` é direto, mas mexer
em infraestrutura de request nova sem você por perto para revisar pareceu mais
arriscado do que valia a pena). **Recomendo tratar antes de divulgar a URL de
cadastro publicamente.**

## Configurar o webhook no painel do Asaas

Depois do deploy, cadastre `https://{seu-dominio}/api/webhooks/asaas` no
painel do Asaas (Configurações → Integrações → Webhooks), com o mesmo
`webhookToken` que você colocar na tela de configuração do superadmin.
