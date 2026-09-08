import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CriarLojaDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome da loja.' })
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string | null;
}

export class EditarLojaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome da loja.' })
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string | null;
}
