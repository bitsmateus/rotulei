/**
 * Papeis do Rotulei.
 *
 * `sistema` nao e um papel de pessoa: e o contexto usado por webhooks e jobs
 * que precisam escrever fora do escopo de um tenant (ex.: Asaas confirmando
 * pagamento). Nunca deve ser derivado de um JWT de usuario.
 */
export const PAPEIS_USUARIO = ['superadmin', 'admin', 'operador'] as const;
export type PapelUsuario = (typeof PAPEIS_USUARIO)[number];

export const PAPEIS_CONTEXTO = [...PAPEIS_USUARIO, 'sistema'] as const;
export type PapelContexto = (typeof PAPEIS_CONTEXTO)[number];

/** Papeis que enxergam dados de todos os tenants. */
export const PAPEIS_GLOBAIS: readonly PapelContexto[] = ['superadmin', 'sistema'];

export function ehPapelUsuario(v: unknown): v is PapelUsuario {
  return typeof v === 'string' && (PAPEIS_USUARIO as readonly string[]).includes(v);
}

/**
 * Papeis que o ADMIN de um tenant pode atribuir ao cadastrar/editar um
 * usuario (item 7, painel do tenant). `superadmin` fica de fora de proposito:
 * nao existe like o tenant "promover" alguem a acesso cross-tenant.
 */
export const PAPEIS_ATRIBUIVEIS_PELO_ADMIN = ['admin', 'operador'] as const;

