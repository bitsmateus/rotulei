import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

/**
 * So preco/limite/ativo — o que o ESCOPO.md pede ("planos... preco e limites
 * editaveis sem precisar de deploy"). `recursos` (feature flags por plano) e
 * `codigo` ficam de fora desta tela: mudar o codigo quebraria o cadastro
 * publico, que referencia planoCodigo.
 */
export class EditarPlanoDto {
  @IsOptional() @IsString() @MaxLength(100) nome?: string;

  @IsOptional() @IsInt() @Min(0) precoMensalCentavos?: number;

  @IsOptional() @IsInt() @Min(0) precoAnualCentavos?: number | null;

  @IsOptional() @IsBoolean() precoPorLoja?: boolean;

  @IsOptional() @IsInt() @IsPositive() limiteLojas?: number | null;

  @IsOptional() @IsBoolean() ativo?: boolean;
}
