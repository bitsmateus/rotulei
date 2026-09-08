# Auditoria funcional e de segurança — 08/09/2026

Resultado: os cenários automatizados descritos abaixo passaram, e falhas foram
corrigidas. **Não é aprovação para produção nem garantia de ausência de bugs.**
Ainda existem pendências de sessão, cobrança, impressão e cobertura de deploy.
O workspace recebeu alterações de outra execução durante a auditoria; a tela de
cadastro que apareceu nesse intervalo foi incluída nos testes de navegador.

## Evidências

| Verificação | Resultado |
| --- | --- |
| API, banco, RLS, autenticação e validações | 174 testes aprovados |
| Frontend, motor de cartaz e regressões de sessão/fila | 38 testes aprovados |
| Edge headless, desktop 1440×1000 e viewport móvel 390×844 | Cadastro, uso do estúdio e bloqueio/cobrança aprovados nos dois tamanhos |
| Limite do login via HTTP, inclusive X-Forwarded-For forjado | 429 confirmado com limites habilitados |
| Compilação da API e build do frontend | Aprovados; 3 avisos de fontes ausentes |
| npm audit | 0 vulnerabilidades conhecidas reportadas |
| Migrações do zero | 13 aplicadas em banco temporário durante cada execução isolada |

Os testes de navegador verificam cadastro inválido/válido, login inválido/válido,
rotas protegidas, edição de produto/preço, adição e abertura da fila, restauração
após reload, logout e troca de tenant sem herdar a fila. O fluxo do estúdio
captura exceções JavaScript e verifica ausência de rolagem horizontal nesses
dois tamanhos. Também foram testados bloqueio real por inadimplência, botão de
regularização exclusivo do admin, orientação ao operador e recuperação da tela
após erro de checkout sem credencial de gateway. A chamada `window.print` foi interceptada: comprova o acionamento,
mas não valida impressora física, diálogo nativo nem fidelidade do papel.

Artefatos locais: `artifacts/playwright-report/index.html` e
`apps/api/artifacts/estudio-desktop.png`, `estudio-mobile.png`.

## Falhas corrigidas

- Operador acessava status de assinatura e iniciava checkout. As duas rotas
  agora exigem papel admin; regressão HTTP confirma 403 para operador.
- Login sem limitação de tentativas. Login e refresh agora têm limites por IP.
  A flag que desliga limites é recusada fora de NODE_ENV=test.
- Confiança fixa em proxy permitia confiar em IP informado em acesso direto.
  O padrão agora não confia em X-Forwarded-For; o deploy configura explicitamente
  TRUST_PROXY_HOPS conforme sua topologia.
- Duas chamadas concorrentes podiam consumir o mesmo refresh token. A sessão
  é bloqueada com SELECT FOR UPDATE antes da rotação; o teste confirma que
  somente uma resposta emite tokens e que a detecção de reuso revoga a sessão.
- A recuperação de sessão do frontend não compartilhava a renovação, incluindo
  a montagem dupla do StrictMode. Agora compartilha a promessa e trata falha de
  rede na montagem do provider sem rejeição não tratada.
- A fila usava uma chave única para todas as contas. Agora é separada por tenant
  e usuário, e a fila antiga sem proprietário não é importada automaticamente.
- Arrays de fila com itens inválidos derrubavam a tela ao abrir cartazes.
  Os itens são validados antes de serem usados.
- O editor aparecia para usuários bloqueados por assinatura. Agora mostra
  aviso de bloqueio, preservando também o bloqueio das rotas de negócio na API.
- Limite de listagem inválido e produto só com espaços chegavam ao banco.
  Agora respondem 400; nomes de cadastro só com espaços também são recusados.
- Webhook com token inválido apenas registrava aviso e consultava o gateway.
  Agora é ignorado antes da consulta; identificador de pagamento é validado.
- A rota pública de saúde expunha nome de banco e role. Esses detalhes foram
  removidos. Respostas da API recebem no-store, nosniff, DENY e no-referrer;
  X-Powered-By foi desabilitado.
- Testes reutilizavam documentos de cadastro e podiam atingir um servidor antigo
  na porta fixa, produzindo resultados incorretos. npm test agora cria um banco
  local exclusivo, aplica schema/seed e o remove ao terminar. A API usa porta
  disponível e a suíte espera o processo criado realmente iniciar.

## Segurança revisada e limites

As suítes existentes e as regressões exercitam isolamento entre tenants por
HTTP e por SQL, JWT adulterado/algoritmo none, permissões de superadmin,
impossibilidade de desativar RLS pela role da API, proteção de status de tenant,
hash de senha, rotação/reuso de sessão e cifra de credenciais do gateway.
A configuração do Asaas não devolve a chave completa nas respostas de status.
O contexto de tenant vem do JWT, e consultas de negócio passam pelo contexto
transacional. Não foi encontrado uso de dangerouslySetInnerHTML/eval no código
de aplicação inspecionado. Isso não substitui fuzzing ou pentest independente.

## Pendências antes de produção

| Prioridade | Pendência e impacto |
| --- | --- |
| Alta | Refresh token permanece em localStorage, acessível a JavaScript. Migrar para cookie HttpOnly com proteção CSRF e testes de sessão entre abas. A janela curta do access token não limita por si só a vida de um refresh roubado. |
| Alta | iniciarCheckout sempre cria assinatura externa e depois substitui o ID local. Repetição/concorrência ou falha entre gateway e banco pode duplicar cobranças ou perder a associação. Implementar idempotência e recuperação, com testes no sandbox do Asaas. |
| Alta | Conciliação considera status da assinatura lido antes da transação e não ordena ciclos de cobrança. Eventos antigos/concorrentes e estornos precisam de testes e regras explícitas antes da aprovação financeira. |
| Média | O operador ainda tem acesso aos cartazes de outras lojas do mesmo tenant pelo RLS atual. Definir se loja é fronteira de autorização e, nesse caso, aplicar restrições consistentes em leitura e escrita. |
| Média | Loja inexistente/de outro tenant na criação e criação por superadmin sem tenant ainda dependem de constraints, podendo gerar 500 genérico. Normalizar erros de domínio e acrescentar cobertura. |
| Média | Refresh simultâneo entre abas ainda pode disparar detecção de reuso; a promessa compartilhada só coordena chamadas da mesma aba. |
| Média | Arquivos masters-black.otf, masters-birds.otf e masters-rough-thin.otf não existem no projeto. A seleção dessas fontes usa fallback. É necessário fornecer os arquivos autorizados e validar impressão. |
| Média | O editor ainda não usa a API para salvar/listar cartazes; a fila é local. Não há garantia de persistência entre dispositivos. |
| Média | Fila separada por chave evita mistura na interface, mas localStorage não oferece confidencialidade contra alguém com acesso ao perfil do navegador. |
| Média | Limitação por IP usa memória por processo; não é compartilhada entre réplicas. Validar o IP real na cadeia de proxies e bloquear acesso direto à API no deploy. |

O catálogo de telas foi obtido de App.tsx: login, cadastro e estúdio, incluindo
seu estado de bloqueio com interface de cobrança, no momento da verificação.
Administração de lojas/usuários/planos, configuração visual do
gateway e demais telas previstas no escopo não estavam implementadas nesse
recorte. Não foram certificados fluxos que ainda não existem.

Não foram testados produção/EasyPanel, TLS, backups/restauração, políticas de
retenção de dados, credenciais reais, pagamento real, carga sustentada, Firefox,
Safari/iPhone físico ou usabilidade com pessoas representativas do público.
Os testes locais não permitem afirmar a segurança da infraestrutura publicada.

## Como repetir

Com Postgres local e as roles já criadas:

```powershell
npm test
npm run build
node apps/api/test/executar-isolado.mjs --browser
npm audit
```

O teste de navegador usa o Edge instalado no Windows. O script isolado exige
DATABASE_URL_ADMIN local e permissão para criar/remover apenas seu banco
temporário. Não usa db:reset nem apaga o banco de desenvolvimento. test:watch
continua sendo o runner direto e deve receber um ambiente de teste apropriado.

No deploy, configurar TRUST_PROXY_HOPS corretamente e cadastrar o mesmo token
do webhook no Rotulei e no Asaas: token ausente/incorreto agora faz o evento ser
ignorado, sem conciliar pagamentos. O retorno continua 200 para eventos ignorados.
