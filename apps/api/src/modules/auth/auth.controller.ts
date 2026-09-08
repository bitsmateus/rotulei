import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto, RefreshDto } from './auth.dto.js';
import { Publico } from '../../common/decorators/publico.decorator.js';
import { LimitarPorIp } from '../../common/guards/limite-por-ip.guard.js';
import { PermiteQuandoBloqueado } from '../../common/decorators/permite-quando-bloqueado.decorator.js';
import {
  UsuarioAtual,
  type UsuarioAutenticado,
} from '../../common/decorators/usuario-atual.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('login')
  @LimitarPorIp({ limite: 20, janelaMs: 60_000 })
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const { accessToken, refreshToken, expiraEm } = await this.auth.login({
      email: dto.email,
      senha: dto.senha,
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
    });
    return { accessToken, refreshToken, expiraEm };
  }

  @Publico()
  @Post('refresh')
  @LimitarPorIp({ limite: 60, janelaMs: 60_000 })
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Req() req: any) {
    const { accessToken, refreshToken, expiraEm } = await this.auth.renovar(
      dto.refreshToken,
      req.headers['user-agent'] ?? null,
      req.ip ?? null,
    );
    return { accessToken, refreshToken, expiraEm };
  }

  @Publico()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto) {
    // Publico de proposito: deslogar tem de funcionar mesmo com o access token
    // ja expirado — e exatamente quando o usuario mais quer encerrar a sessao.
    await this.auth.encerrar(dto.refreshToken);
  }

  @PermiteQuandoBloqueado()
  @Post('logout-total')
  @HttpCode(204)
  async logoutTotal(@UsuarioAtual() usuario: UsuarioAutenticado) {
    await this.auth.encerrarTodas(usuario.id);
  }

  /**
   * Quem sou eu — o front usa para reidratar a sessao ao abrir a pagina, e
   * tambem para decidir se mostra a tela de cobranca (usuario.bloqueado).
   */
  @PermiteQuandoBloqueado()
  @Get('eu')
  eu(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return usuario;
  }
}
