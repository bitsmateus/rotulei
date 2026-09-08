import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CadastroPublicoDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome do mercado.' })
  @MaxLength(200)
  nomeMercado!: string;

  @IsString()
  // Aceita com ou sem mascara; a service normaliza para so digitos.
  @Matches(/^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, {
    message: 'CNPJ invalido — use 14 digitos.',
  })
  cnpj!: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe seu nome.' })
  @MaxLength(200)
  nomeAdmin!: string;

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
