import { describe, expect, it } from 'vitest';
import { cifrarCom, decifrarCom } from './aes.js';

const CHAVE = 'chave-de-teste-com-mais-de-32-caracteres-1234';
const OUTRA_CHAVE = 'outra-chave-completamente-diferente-56789';

describe('AES-256-GCM (cifrarCom / decifrarCom)', () => {
  it('decifra exatamente o que foi cifrado', () => {
    const original = 'segredo-super-secreto-do-asaas';
    const cifrado = cifrarCom(CHAVE, original);
    expect(decifrarCom(CHAVE, cifrado)).toBe(original);
  });

  it('o texto cifrado nao contem o texto original em claro', () => {
    const original = 'apiKeyMuitoEspecificaDoAsaas12345';
    const cifrado = cifrarCom(CHAVE, original);
    expect(cifrado).not.toContain(original);
  });

  it('duas cifragens do mesmo texto produzem saidas diferentes (IV aleatorio)', () => {
    const a = cifrarCom(CHAVE, 'mesmo-texto');
    const b = cifrarCom(CHAVE, 'mesmo-texto');
    expect(a).not.toBe(b);
    // mas as duas decifram para o mesmo original
    expect(decifrarCom(CHAVE, a)).toBe(decifrarCom(CHAVE, b));
  });

  it('decifrar com a chave errada falha, nao devolve lixo silenciosamente', () => {
    const cifrado = cifrarCom(CHAVE, 'dado-sensivel');
    // GCM tem tag de autenticacao: chave errada lanca erro, nao decifra errado.
    expect(() => decifrarCom(OUTRA_CHAVE, cifrado)).toThrow();
  });

  it('payload adulterado (1 byte trocado) e detectado, nao aceito', () => {
    const cifrado = cifrarCom(CHAVE, 'dado-sensivel');
    const [iv, tag, dados] = cifrado.split('.');
    // troca o primeiro caractere do ciphertext
    const dadosAdulterados = (dados[0] === 'A' ? 'B' : 'A') + dados.slice(1);
    const adulterado = `${iv}.${tag}.${dadosAdulterados}`;
    expect(() => decifrarCom(CHAVE, adulterado)).toThrow();
  });

  it('payload malformado (sem os 3 segmentos) lanca erro claro', () => {
    expect(() => decifrarCom(CHAVE, 'nao-e-um-payload-valido')).toThrow(/invalido/i);
  });

  it('funciona para JSON — o formato usado para credenciais', () => {
    const objeto = { apiKey: 'abc123', webhookToken: 'xyz789', ambiente: 'sandbox' as const };
    const cifrado = cifrarCom(CHAVE, JSON.stringify(objeto));
    expect(JSON.parse(decifrarCom(CHAVE, cifrado))).toEqual(objeto);
  });
});
