import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ClaimsDoToken } from '../../modules/auth/auth.service.js';

export interface UsuarioAutenticado {
  id: string;
  tenantId: string | null;
  lojaId: string | null;
  papel: ClaimsDoToken['papel'];
}

/** Injeta o usuario do token no handler: `verificar(@UsuarioAtual() u) {...}`. */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, ctx: ExecutionContext): UsuarioAutenticado | null => {
    return ctx.switchToHttp().getRequest().usuario ?? null;
  },
);
