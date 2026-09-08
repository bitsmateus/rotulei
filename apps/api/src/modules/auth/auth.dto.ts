import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'E-mail invalido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe a senha.' })
  @MaxLength(200)
  senha!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  refreshToken!: string;
}

export class DefinirSenhaDto {
  @IsString()
  // 10 caracteres em vez de 8: e a recomendacao atual da OWASP quando nao ha
  // exigencia de complexidade (que empurra o usuario para "Senha@123").
  @MinLength(10, { message: 'A senha precisa ter ao menos 10 caracteres.' })
  @MaxLength(200)
  senha!: string;
}
