import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FONTES, TEMAS } from '@rotulei/shared';

const IDS_DE_TEMA = TEMAS.map((t) => t.id);
const VALORES_DE_FONTE = FONTES.map((f) => f.valor);

/** Um campo de texto do cartaz: opcional, com teto de tamanho. */
const Texto = (max = 120) => [IsOptional(), IsString(), MaxLength(max)];

export class CartazDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o produto.' })
  @MaxLength(200)
  produto!: string;

  @IsOptional() @IsUUID() lojaId?: string | null;

  @IsOptional() @IsString() @MaxLength(200) subtitulo?: string;
  @IsOptional() @IsString() @MaxLength(60) peso?: string;
  @IsOptional() @IsString() @MaxLength(30) preco?: string;
  @IsOptional() @IsString() @MaxLength(30) precoDe?: string;
  @IsOptional() @IsString() @MaxLength(30) unidade?: string;
  @IsOptional() @IsString() @MaxLength(10) minUnidades?: string;
  @IsOptional() @IsString() @MaxLength(30) precoAvulso?: string;
  @IsOptional() @IsString() @MaxLength(10) caixaQtd?: string;
  @IsOptional() @IsString() @MaxLength(30) caixaPreco?: string;
  @IsOptional() @IsString() @MaxLength(30) precoLitro?: string;
  @IsOptional() @IsString() @MaxLength(60) textoFaixa?: string;

  @IsOptional() @IsBoolean() mostrarFaixa?: boolean;
  @IsOptional() @IsBoolean() mostrarDePor?: boolean;
  @IsOptional() @IsBoolean() mostrarLogo?: boolean;
  @IsOptional() @IsBoolean() mostrarBolinhaPreco?: boolean;
  @IsOptional() @IsBoolean() mostrarPrecoAvulsoCaixa?: boolean;

  // Lista fechada: o tema e a fonte viram CSS no cartaz impresso, entao
  // aceitar valor livre aqui seria deixar o cliente injetar font-family.
  @IsOptional() @IsIn(IDS_DE_TEMA) temaId?: string;
  @IsOptional() @IsIn(VALORES_DE_FONTE) fonte?: string;

  @IsOptional() @IsInt() @Min(-3) @Max(3) ajusteNome?: number;
  @IsOptional() @IsInt() @Min(-3) @Max(3) ajusteSubtitulo?: number;
  @IsOptional() @IsInt() @Min(-3) @Max(3) ajusteFaixa?: number;
  @IsOptional() @IsInt() @Min(-3) @Max(3) ajustePreco?: number;
  @IsOptional() @IsInt() @Min(-3) @Max(3) ajustePeso?: number;
}

void Texto;
