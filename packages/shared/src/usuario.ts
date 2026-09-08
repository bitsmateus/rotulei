import type { PapelUsuario } from './papeis.js';

export interface Usuario {
  id: string;
  /** null apenas para superadmin — ele nao pertence a nenhum tenant. */
  tenantId: string | null;
  /** Operador pode ser fixado numa loja. Admin normalmente e null (ve todas). */
  lojaId: string | null;
  nome: string;
  email: string;
  papel: PapelUsuario;
  /** So preenchido para quem passou pelo cadastro publico. */
  cpf: string | null;
  telefone: string | null;
  ativo: boolean;
  ultimoLoginEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}
