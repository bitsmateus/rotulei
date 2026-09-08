import { IsOptional, Matches, MaxLength } from 'class-validator';

/**
 * ~500KB de base64 (~370KB de arquivo) — teto generoso para um logo de
 * mercado, mas que ainda cabe folgado no limite de 1MB do body JSON
 * (main.ts). Nao e um limite de producao fino, e uma trava contra abuso.
 */
const TAMANHO_MAXIMO_LOGO = 500_000;

export class EditarMarcaDto {
  @IsOptional()
  @Matches(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, {
    message: 'Logo precisa ser uma imagem PNG, JPEG ou WEBP.',
  })
  @MaxLength(TAMANHO_MAXIMO_LOGO, { message: 'Logo muito grande — use uma imagem menor.' })
  logoDataUrl?: string | null;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Cor precisa estar no formato #RRGGBB.' })
  corPrimaria?: string | null;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Cor precisa estar no formato #RRGGBB.' })
  corSecundaria?: string | null;
}
