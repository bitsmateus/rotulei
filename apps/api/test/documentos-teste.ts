/**
 * Geradores de CPF/CNPJ/telefone VALIDOS para teste — o service agora confere
 * digito verificador de verdade (modulo 11), entao documentos de teste
 * precisam ser genuinamente calculados, nao so ter a contagem certa de
 * digitos. A matematica do digito verificador espelha
 * `packages/shared/src/documentos.ts`.
 */

/**
 * LCG simples (Numerical Recipes) para os digitos-base. Period bem maior que
 * `% 10` de proposito: uma formula ingenua tipo `(sufixo + i*7) % 10` repete
 * a cada 10 — sufixos como 30 e 40 gerariam o MESMO cpf, o que ja aconteceu
 * aqui uma vez (colisao real, nao hipotetica) antes desta versao.
 */
function digitosPseudoAleatorios(semente: number, quantidade: number): number[] {
  let x = (semente * 9301 + 49297) % 233280;
  const digitos: number[] = [];
  for (let i = 0; i < quantidade; i++) {
    x = (x * 9301 + 49297) % 233280;
    digitos.push(Math.floor((x / 233280) * 10));
  }
  return digitos;
}

function digitoVerificadorCpf(digitos: number[], tamanho: number): number {
  let soma = 0;
  for (let i = 0; i < tamanho; i++) soma += digitos[i] * (tamanho + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(semente: number): string {
  const base = digitosPseudoAleatorios(semente, 9);
  if (base.every((d) => d === base[0])) base[0] = (base[0] + 3) % 10; // nunca todos iguais
  const d1 = digitoVerificadorCpf(base, 9);
  const d2 = digitoVerificadorCpf([...base, d1], 10);
  return [...base, d1, d2].join('');
}

function digitoVerificadorCnpj(digitos: number[], tamanho: number): number {
  const pesos =
    tamanho === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < tamanho; i++) soma += digitos[i] * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(semente: number): string {
  // Semente deslocada: um CPF e um CNPJ gerados com a MESMA semente nao
  // podem compartilhar a sequencia pseudoaleatoria de digitos-base.
  const base = digitosPseudoAleatorios(semente * 7 + 3, 12);
  if (base.every((d) => d === base[0])) base[0] = (base[0] + 3) % 10;
  const d1 = digitoVerificadorCnpj(base, 12);
  const d2 = digitoVerificadorCnpj([...base, d1], 13);
  return [...base, d1, d2].join('');
}

export function telefoneValido(semente: number): string {
  const [d1, d2, d3, d4, d5, d6, d7, d8] = digitosPseudoAleatorios(semente * 13 + 5, 8);
  return `11 9${d1}${d2}${d3}${d4}${d5}${d6}${d7}${d8}`.replace(/\s/g, '');
}
