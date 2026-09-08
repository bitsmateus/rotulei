import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CadastroPublicoService } from './cadastro-publico.service.js';
import { CadastroPublicoDto } from './cadastro-publico.dto.js';
import { Publico } from '../../common/decorators/publico.decorator.js';
import { LimitarPorIp } from '../../common/guards/limite-por-ip.guard.js';

@Controller('public')
export class CadastroPublicoController {
  constructor(private readonly cadastro: CadastroPublicoService) {}

  /**
   * Cadastro publico: cria tenant + admin em trial, sem cartao (ESCOPO.md).
   * Ja devolve os tokens — o admin entra direto, sem precisar logar de novo.
   *
   * Limite generoso o bastante pra alguem corrigir um typo de CPF/CNPJ
   * (5 tentativas), apertado o bastante pra travar um script criando
   * tenants em massa. A regra que impede a MESMA PESSOA de abrir mais de
   * um trial (por CPF/telefone, nao por IP) fica no service — ver
   * usuarios_cpf_uk / usuarios_telefone_uk.
   */
  @Publico()
  @LimitarPorIp({ limite: 5, janelaMs: 60 * 60 * 1000 })
  @Post('cadastro')
  @HttpCode(201)
  cadastrar(@Body() dto: CadastroPublicoDto) {
    return this.cadastro.cadastrar(dto);
  }
}
