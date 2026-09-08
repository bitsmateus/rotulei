export interface Loja {
  id: string;
  tenantId: string;
  nome: string;
  endereco: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}
