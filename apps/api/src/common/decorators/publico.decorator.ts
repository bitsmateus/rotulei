import { SetMetadata } from '@nestjs/common';

export const CHAVE_PUBLICO = 'rotulei:publico';

/**
 * Marca uma rota como acessivel sem token.
 *
 * O guard de auth e GLOBAL: por padrao tudo exige login. Uma rota nova nasce
 * protegida e so fica publica se alguem escrever @Publico() de proposito —
 * o oposto (proteger uma a uma) esquece rota.
 */
export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);
