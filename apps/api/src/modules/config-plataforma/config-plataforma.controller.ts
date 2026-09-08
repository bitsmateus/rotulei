import { Body, Controller, Get, Put } from '@nestjs/common';
import { ConfigPlataformaService } from './config-plataforma.service.js';
import { SalvarAsaasConfigDto } from './config-plataforma.dto.js';
import { Papeis } from '../../common/decorators/papeis.decorator.js';
import {
  UsuarioAtual,
  type UsuarioAutenticado,
} from '../../common/decorators/usuario-atual.decorator.js';

/**
 * Configuracao de gateway de pagamento da plataforma — DECISOES.md #17.
 *
 * So superadmin. O valor da credencial nunca volta em resposta nenhuma; so
 * "configurado?", ambiente e os ultimos 4 caracteres.
 */
@Papeis('superadmin')
@Controller('admin/config')
export class ConfigPlataformaController {
  constructor(private readonly config: ConfigPlataformaService) {}

  @Get('asaas')
  status() {
    return this.config.obterStatus();
  }

  @Put('asaas')
  async salvar(@Body() dto: SalvarAsaasConfigDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    const { conexaoOk } = await this.config.salvar(dto, usuario.id);
    const status = await this.config.obterStatus();
    return { ...status, conexaoOk };
  }
}
