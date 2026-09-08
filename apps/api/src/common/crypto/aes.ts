import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * AES-256-GCM puro, parametrizado pela chave.
 *
 * Formato: base64(iv).base64(authTag).base64(ciphertext)
 * A chave AES (32 bytes) e derivada por sha256 da string de configuracao — isso
 * permite CONFIG_SECRET ser qualquer string longa, nao exatamente 32 bytes.
 */

function derivarChave(chave: string): Buffer {
  return createHash('sha256').update(chave).digest();
}

export function cifrarCom(chave: string, textoPlano: string): string {
  const k = derivarChave(chave);
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', k, iv);
  const cifrado = Buffer.concat([cifrador.update(textoPlano, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${cifrado.toString('base64')}`;
}

export function decifrarCom(chave: string, payload: string): string {
  const [ivB64, tagB64, dadosB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dadosB64) throw new Error('Payload cifrado invalido.');
  const k = derivarChave(chave);
  const decifrador = createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64'));
  decifrador.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decifrado = Buffer.concat([
    decifrador.update(Buffer.from(dadosB64, 'base64')),
    decifrador.final(),
  ]);
  return decifrado.toString('utf8');
}
