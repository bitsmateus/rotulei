/**
 * Testes do validador de CPF/CNPJ/telefone de packages/shared. Vive na API
 * porque e a API que os usa para bloquear cadastro (cadastro-publico.service);
 * o pacote compartilhado nao tem runner de teste proprio.
 */
import { describe, expect, it } from 'vitest';
import { apenasDigitos, validarCnpj, validarCpf, validarTelefone } from '@rotulei/shared';

describe('validarCpf', () => {
  it('aceita o CPF de teste classico', () => {
    expect(validarCpf('111.444.777-35')).toBe(true);
    expect(validarCpf('11144477735')).toBe(true); // sem mascara
  });

  it('rejeita digito verificador errado', () => {
    expect(validarCpf('111.444.777-36')).toBe(false);
    expect(validarCpf('111.444.777-00')).toBe(false);
  });

  it('rejeita todos os digitos iguais (formula bateria mesmo assim)', () => {
    // 000.000.000-00 e outros repdigits passam na formula do modulo 11 por
    // coincidencia matematica — por isso o validador tem um check explicito.
    for (const d of '0123456789') {
      expect(validarCpf(d.repeat(11))).toBe(false);
    }
  });

  it('rejeita tamanho errado', () => {
    expect(validarCpf('123')).toBe(false);
    expect(validarCpf('123456789012')).toBe(false);
    expect(validarCpf('')).toBe(false);
  });
});

describe('validarCnpj', () => {
  it('aceita o CNPJ de teste classico', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
    expect(validarCnpj('11222333000181')).toBe(true);
  });

  it('rejeita digito verificador errado', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false);
  });

  it('rejeita todos os digitos iguais', () => {
    expect(validarCnpj('00000000000000')).toBe(false);
    expect(validarCnpj('11111111111111')).toBe(false);
  });

  it('rejeita tamanho errado', () => {
    expect(validarCnpj('123')).toBe(false);
    expect(validarCnpj('')).toBe(false);
  });
});

describe('validarTelefone', () => {
  it('aceita celular (11 digitos, comecando com 9)', () => {
    expect(validarTelefone('(11) 98888-7777')).toBe(true);
    expect(validarTelefone('11988887777')).toBe(true);
  });

  it('aceita fixo (10 digitos)', () => {
    expect(validarTelefone('(11) 8888-7777')).toBe(true);
  });

  it('rejeita DDD fora do intervalo 11-99', () => {
    expect(validarTelefone('(00) 98888-7777')).toBe(false);
    expect(validarTelefone('(05) 98888-7777')).toBe(false);
  });

  it('rejeita celular de 11 digitos sem o 9 na frente', () => {
    expect(validarTelefone('(11) 78888-7777')).toBe(false);
  });

  it('rejeita tamanho errado', () => {
    expect(validarTelefone('123')).toBe(false);
    expect(validarTelefone('119888877771')).toBe(false); // 12 digitos
  });
});

describe('apenasDigitos', () => {
  it('remove tudo que nao for numero', () => {
    expect(apenasDigitos('111.444.777-35')).toBe('11144477735');
    expect(apenasDigitos('(11) 98888-7777')).toBe('11988887777');
  });
});
