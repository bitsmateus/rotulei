import { Controller, Get, Post } from '@nestjs/common';
import { AssinaturaService } from './assinatura.service.js';
import { PermiteQuandoBloqueado } from '../../common/decorators/permite-quando-bloqueado.decorator.js';
import { Papeis } from '../../common/decorators/papeis.decorator.js';
import {
  UsuarioAtual,
  type UsuarioAutenticado,
} from '../../common/decorators/usuario-atual.decorator.js';

/**
 * Ambas as rotas precisam de @PermiteQuandoBloqueado(): sao exatamente as
 * rotas que um tenant BLOQUEADO precisa usar para se desbloquear. Sem a
 * marcacao, o proprio guard que aplica o bloqueio impediria o desbloqueio.
 */
@PermiteQuandoBloqueado()
@Papeis('admin')
@Controller('tenant/assinatura')
export class AssinaturaController {
  constructor(private readonly assinatura: AssinaturaService) {}

  @Get()
  status(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.assinatura.obterStatus(usuario);
  }

  @Post('checkout')
  checkout(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.assinatura.iniciarCheckout(usuario);
  }
}
