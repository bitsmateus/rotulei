import { SetMetadata } from '@nestjs/common';
import type { PapelUsuario } from '@rotulei/shared';

export const CHAVE_PAPEIS = 'rotulei:papeis';

/**
 * Restringe a rota a certos papeis. Sem o decorator, qualquer usuario
 * autenticado do tenant pode chamar (o RLS ainda limita o que ele ve).
 *
 * Superadmin NAO passa automaticamente: se uma rota e so de superadmin,
 * escreva @Papeis('superadmin').
 */
export const Papeis = (...papeis: PapelUsuario[]) => SetMetadata(CHAVE_PAPEIS, papeis);
