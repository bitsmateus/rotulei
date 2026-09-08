import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PAPEIS_ATRIBUIVEIS_PELO_ADMIN } from '@rotulei/shared';

export class CriarUsuarioDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nome!: string;

  @IsEmail({}, { message: 'E-mail invalido.' })
  @MaxLength(255)
  email!: string;

  // 10 caracteres: mesma recomendacao OWASP usada em DefinirSenhaDto (auth.dto.ts).
  @IsString()
  @MinLength(10, { message: 'A senha precisa ter ao menos 10 caracteres.' })
  @MaxLength(200)
  senha!: string;

  @IsIn(PAPEIS_ATRIBUIVEIS_PELO_ADMIN, { message: 'Papel invalido.' })
  papel!: (typeof PAPEIS_ATRIBUIVEIS_PELO_ADMIN)[number];

  @IsOptional()
  @IsUUID()
  lojaId?: string | null;
}

export class EditarUsuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsIn(PAPEIS_ATRIBUIVEIS_PELO_ADMIN, { message: 'Papel invalido.' })
  papel?: (typeof PAPEIS_ATRIBUIVEIS_PELO_ADMIN)[number];

  @IsOptional()
  @IsUUID()
  lojaId?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
