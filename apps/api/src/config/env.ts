import { z } from 'zod';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// O .env vive na raiz do monorepo, compartilhado por api e web.
config({ path: resolve(import.meta.dirname, '../../../..', '.env'), quiet: true });

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),

  /**
   * Conexao da API. Tem de apontar para rotulei_app — a role sem BYPASSRLS.
   * Apontar para o owner aqui desliga o isolamento entre tenants sem produzir
   * erro nenhum, entao o boot valida isso (ver database/pool.ts).
   */
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  /**
   * Segredo de assinatura do JWT. 32 caracteres e o piso para HS256 —
   * abaixo disso o segredo tem menos entropia que o proprio algoritmo.
   * Gere com: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   */
  JWT_SECRET: z.string().min(32, 'use ao menos 32 caracteres'),

  /** Access token curto: e o que limita a janela de um token vazado. */
  ACCESS_TOKEN_MINUTOS: z.coerce.number().int().positive().default(15),

  /** Refresh token longo, mas rotacionado a cada uso. */
  REFRESH_TOKEN_DIAS: z.coerce.number().int().positive().default(30),

  /**
   * Chave de cifra dos segredos guardados no banco (hoje, o token do Asaas —
   * DECISOES.md #17). NUNCA fica no banco: e o que faz um dump sozinho nao
   * bastar para ler a credencial. Perder esta variavel e perder os segredos
   * cifrados com ela — faz parte do procedimento de backup (ver DEPLOY.md).
   */
  CONFIG_SECRET: z.string().min(32, 'use ao menos 32 caracteres'),
  /** Preenchida so durante uma rotacao de CONFIG_SECRET; depois, remova. */
  CONFIG_SECRET_OLD: z.string().min(32).optional(),

  /**
   * So para test/servidor.ts: desliga o LimitePorIpGuard, porque a suite de
   * e2e bate dezenas de vezes no mesmo endpoint a partir do mesmo IP.
   *
   * Deliberadamente NAO amarrado a NODE_ENV=test — o vitest seta essa
   * variavel sozinho em qualquer worker, inclusive nos testes UNITARIOS do
   * proprio guard, que precisam do limite LIGADO pra testar a logica de
   * verdade. Uma flag propria tambem fica mais facil de flagrar numa
   * revisao de variaveis de ambiente antes de subir pra producao.
   */
  // NUNCA `z.coerce.boolean()` aqui: ele usa `Boolean(string)` por baixo, e
  // `Boolean("false")` e `true` — qualquer string nao-vazia vira `true`.
  // Isso teria desligado o rate limit permanentemente em qualquer ambiente
  // que definisse a variavel, mesmo como "false".
  DESABILITAR_LIMITES: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof esquema>;

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  const detalhes = resultado.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Configuracao invalida:\n${detalhes}`);
}

export const env: Env = resultado.data;
