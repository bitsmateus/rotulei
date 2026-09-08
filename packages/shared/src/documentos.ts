/**
 * Validacao de documentos brasileiros — algoritmo de digito verificador de
 * verdade, nao so contagem de digitos. Usado no cadastro publico para
 * recusar CPF/CNPJ que tem o formato certo mas o digito errado (erro de
 * digitacao, gerador de CPF falso online, etc.).
 */

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** true se todos os digitos forem iguais (000.000.000-00, 111.111.111-11...). */
function todosOsDigitosIguais(digitos: string): boolean {
  return /^(\d)\1*$/.test(digitos);
}

export function validarCpf(valor: string): boolean {
  const cpf = apenasDigitos(valor);
  if (cpf.length !== 11 || todosOsDigitosIguais(cpf)) return false;

  const digitoVerificador = (tamanho: number): number => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digitoVerificador(9) === Number(cpf[9]) && digitoVerificador(10) === Number(cpf[10]);
}

export function validarCnpj(valor: string): boolean {
  const cnpj = apenasDigitos(valor);
  if (cnpj.length !== 14 || todosOsDigitosIguais(cnpj)) return false;

  const digitoVerificador = (tamanho: number): number => {
    const pesos =
      tamanho === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cnpj[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return digitoVerificador(12) === Number(cnpj[12]) && digitoVerificador(13) === Number(cnpj[13]);
}

/**
 * Telefone brasileiro: DDD (2 digitos, 11-99) + numero (8 digitos fixo ou 9
 * digitos celular, sempre comecando com 9 quando tem 9 digitos).
 */
export function validarTelefone(valor: string): boolean {
  const tel = apenasDigitos(valor);
  if (tel.length !== 10 && tel.length !== 11) return false;

  const ddd = Number(tel.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;

  if (tel.length === 11 && tel[2] !== '9') return false;

  return true;
}
