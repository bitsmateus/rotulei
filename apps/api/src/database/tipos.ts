import type { ColumnType, Generated } from 'kysely';
import type { PapelUsuario, StatusTenant } from '@rotulei/shared';

/** Coluna preenchida pelo banco: nunca enviada no insert, sempre lida. */
type Gerada = ColumnType<Date, never, never>;

export interface PlanoTable {
  id: Generated<string>;
  codigo: string;
  nome: string;
  preco_mensal_centavos: number;
  preco_anual_centavos: number | null;
  preco_por_loja: Generated<boolean>;
  limite_lojas: number | null;
  recursos: Generated<Record<string, unknown>>;
  ativo: Generated<boolean>;
  criado_em: Gerada;
  atualizado_em: Gerada;
}

export interface TenantTable {
  id: Generated<string>;
  nome: string;
  cnpj: string;
  slug: string;
  status: ColumnType<StatusTenant, StatusTenant | undefined, StatusTenant>;
  plano_id: string;
  trial_termina_em: ColumnType<Date | null, Date | string | null, Date | string | null>;
  logo_data_url: string | null;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  criado_em: Gerada;
  atualizado_em: Gerada;
}

export interface LojaTable {
  id: Generated<string>;
  tenant_id: string;
  nome: string;
  endereco: string | null;
  criado_em: Gerada;
  atualizado_em: Gerada;
}

export interface UsuarioTable {
  id: Generated<string>;
  tenant_id: string | null;
  loja_id: string | null;
  nome: string;
  email: string;
  papel: PapelUsuario;
  senha_hash: ColumnType<string | null, string | null | undefined, string | null>;
  /** So preenchido por quem passou pelo cadastro publico — ver migration 0013. */
  cpf: ColumnType<string | null, string | null | undefined, string | null>;
  telefone: ColumnType<string | null, string | null | undefined, string | null>;
  ativo: Generated<boolean>;
  ultimo_login_em: ColumnType<Date | null, Date | string | null, Date | string | null>;
  criado_em: Gerada;
  atualizado_em: Gerada;
}

export interface DB {
  planos: PlanoTable;
  tenants: TenantTable;
  lojas: LojaTable;
  usuarios: UsuarioTable;
  sessoes: SessaoTable;
  cartazes: CartazTable;
  layouts_salvos: LayoutSalvoTable;
  config_plataforma: ConfigPlataformaTable;
  assinaturas: AssinaturaTable;
  pagamentos: PagamentoTable;
}

export interface SessaoTable {
  id: Generated<string>;
  usuario_id: string;
  tenant_id: string | null;
  token_hash: string;
  substituida_por: string | null;
  expira_em: ColumnType<Date, Date | string, Date | string>;
  revogada_em: ColumnType<Date | null, Date | string | null, Date | string | null>;
  motivo_revogacao: string | null;
  user_agent: string | null;
  ip: string | null;
  criado_em: Gerada;
  usada_em: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface CartazTable {
  id: Generated<string>;
  tenant_id: string;
  loja_id: string | null;
  criado_por: string | null;
  produto: string;
  subtitulo: Generated<string>;
  peso: Generated<string>;
  preco: Generated<string>;
  preco_de: Generated<string>;
  unidade: Generated<string>;
  min_unidades: Generated<string>;
  preco_avulso: Generated<string>;
  caixa_qtd: Generated<string>;
  caixa_preco: Generated<string>;
  preco_litro: Generated<string>;
  texto_faixa: Generated<string>;
  mostrar_faixa: Generated<boolean>;
  mostrar_de_por: Generated<boolean>;
  mostrar_logo: Generated<boolean>;
  mostrar_bolinha_preco: Generated<boolean>;
  mostrar_preco_avulso_caixa: Generated<boolean>;
  tema_id: Generated<string>;
  fonte: Generated<string>;
  ajuste_nome: Generated<number>;
  ajuste_subtitulo: Generated<number>;
  ajuste_faixa: Generated<number>;
  ajuste_preco: Generated<number>;
  ajuste_peso: Generated<number>;
  criado_em: Gerada;
  atualizado_em: Gerada;
}

export interface LayoutSalvoTable {
  id: Generated<string>;
  tenant_id: string;
  nome: string;
  patch: Generated<Record<string, unknown>>;
  criado_por: string | null;
  criado_em: Gerada;
  atualizado_em: Gerada;
}

export interface ConfigPlataformaTable {
  id: Generated<string>;
  chave: string;
  ambiente: Generated<string>;
  credenciais_cifradas: string;
  credencial_dica: string | null;
  atualizado_por: string | null;
  criado_em: Gerada;
  atualizado_em: Gerada;
}

export interface AssinaturaTable {
  id: Generated<string>;
  tenant_id: string;
  plano_id: string;
  gateway_subscription_id: string | null;
  status: Generated<string>;
  ciclo: Generated<string>;
  proxima_cobranca_em: ColumnType<Date | null, Date | string | null, Date | string | null>;
  criado_em: Gerada;
  atualizado_em: Gerada;
}

export interface PagamentoTable {
  id: Generated<string>;
  tenant_id: string;
  assinatura_id: string | null;
  valor_centavos: number;
  metodo: string | null;
  status: Generated<string>;
  gateway_payment_id: string | null;
  pago_em: ColumnType<Date | null, Date | string | null, Date | string | null>;
  criado_em: Gerada;
  atualizado_em: Gerada;
}
