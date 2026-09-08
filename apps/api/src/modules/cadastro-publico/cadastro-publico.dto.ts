import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CadastroPublicoDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome do mercado.' })
  @MaxLength(200)
  nomeMercado!: string;

  @IsString()
  // So o FORMATO (com ou sem mascara). O digito verificador de verdade e
  // conferido no service (validarCnpj) — um regex nao calcula modulo 11.
  @Matches(/^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, {
    message: 'CNPJ invalido — use 14 digitos.',
  })
  cnpj!: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe seu nome.' })
  @MaxLength(200)
  nomeAdmin!: string;

  /**
   * CPF de quem esta se cadastrando — nao do mercado. E o que sustenta a
   * regra "um trial por pessoa": CNPJ e e-mail sao triviais de trocar (nova
   * empresa MEI, novo Gmail); o CPF da pessoa por tras, nao.
   */
  @IsString()
  @Matches(/^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/, {
    message: 'CPF invalido — use 11 digitos.',
  })
  cpf!: string;

  @IsString()
  @Matches(/^\d{10,11}$|^\(\d{2}\)\s?\d{4,5}-?\d{4}$/, {
    message: 'Telefone invalido — use DDD + numero.',
  })
  telefone!: string;

  @IsEmail({}, { message: 'E-mail invalido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(10, { message: 'A senha precisa ter ao menos 10 caracteres.' })
  @MaxLength(200)
  senha!: string;

  @IsString()
  @IsNotEmpty({ message: 'Escolha um plano.' })
  planoCodigo!: string;
}
