import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SalvarAsaasConfigDto {
  @IsIn(['sandbox', 'production'])
  ambiente!: 'sandbox' | 'production';

  /**
   * Em branco na edicao = manter a chave atual. So exigida na primeira vez
   * (o service valida isso, nao o DTO, porque a obrigatoriedade depende de
   * ja existir configuracao ou nao).
   */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  webhookToken?: string;
}
