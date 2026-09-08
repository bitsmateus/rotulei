import { Injectable } from '@nestjs/common';
import { env } from '../../config/env.js';
import { cifrarCom, decifrarCom } from './aes.js';

/**
 * Criptografia AES-256-GCM para segredos de terceiros guardados no banco —
 * hoje, o token do Asaas (DECISOES.md #17). Nunca guarde um desses em texto
 * puro: um dump do banco (backup vazado, acesso de leitura mal configurado)
 * entregaria a conta de cobranca junto.
 *
 * Rotacao de chave sem downtime: cifra sempre com CONFIG_SECRET (a atual); ao
 * decifrar, tenta a atual e, se falhar, tenta CONFIG_SECRET_OLD. Depois de
 * migrar todo segredo cifrado para a chave nova, remova CONFIG_SECRET_OLD.
 */
@Injectable()
export class CryptoService {
  cifrar(textoPlano: string): string {
    return cifrarCom(env.CONFIG_SECRET, textoPlano);
  }

  decifrar(payload: string): string {
    try {
      return decifrarCom(env.CONFIG_SECRET, payload);
    } catch (erro) {
      if (env.CONFIG_SECRET_OLD) return decifrarCom(env.CONFIG_SECRET_OLD, payload);
      throw erro;
    }
  }

  cifrarJson(obj: unknown): string {
    return this.cifrar(JSON.stringify(obj));
  }

  decifrarJson<T = Record<string, unknown>>(payload: string): T {
    return JSON.parse(this.decifrar(payload)) as T;
  }
}
