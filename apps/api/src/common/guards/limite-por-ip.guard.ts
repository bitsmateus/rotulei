import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { env } from '../../config/env.js';

/**
 * Rate limiting por IP, em memoria.
 *
 * Escrito a mao em vez de `@nestjs/throttler` porque a versao publicada do
 * pacote (6.5.0) ainda nao declara suporte a peer para o Nest 12 usado neste
 * projeto — instalar exigiria `--legacy-peer-deps` numa peca de seguranca, o
 * que preferi evitar. Para o volume esperado (uma rota publica de cadastro),
 * um guard simples resolve sem depender de terceiro.
 *
 * ⚠️ Limitacao conhecida: o estado e por PROCESSO, nao compartilhado entre
 * replicas. Com mais de uma instancia da API atras do load balancer, cada
 * replica conta separado — o limite efetivo vira (limite × replicas). Para
 * v1, com uma instancia so no EasyPanel, isso nao importa. Se o Rotulei
 * escalar para varias replicas, troque por um contador no Postgres ou Redis.
 */
export const CHAVE_LIMITE = 'rotulei:limite-por-ip';

export interface LimitePorIp {
  /** Tentativas permitidas dentro da janela. */
  limite: number;
  /** Duracao da janela, em milissegundos. */
  janelaMs: number;
}

/** Aplica um limite de requisicoes por IP a uma rota. */
export const LimitarPorIp = (opcoes: LimitePorIp) => SetMetadata(CHAVE_LIMITE, opcoes);

interface Contador {
  tentativas: number;
  expiraEm: number;
}

@Injectable()
export class LimitePorIpGuard implements CanActivate {
  // Chave: "<rota>:<ip>". Um mapa so, compartilhado entre todas as rotas que
  // usarem o guard — cada uma define seu proprio limite via @LimitarPorIp.
  private readonly contadores = new Map<string, Contador>();
  private ultimaLimpeza = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const opcoes = this.reflector.getAllAndOverride<LimitePorIp | undefined>(CHAVE_LIMITE, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!opcoes) return true; // rota sem @LimitarPorIp: guard nao se aplica

    // A suite de e2e (test/servidor.ts) bate dezenas de vezes no mesmo
    // endpoint a partir do MESMO IP (127.0.0.1) — sem esta valvula, os
    // proprios testes tropecariam no limite.
    if (env.DESABILITAR_LIMITES) return true;

    this.limparEntradasVencidasOcasionalmente();

    const req = contexto.switchToHttp().getRequest();
    const ip = extrairIp(req);
    const chave = `${contexto.getHandler().name}:${ip}`;
    const agora = Date.now();

    const contador = this.contadores.get(chave);
    if (!contador || contador.expiraEm <= agora) {
      this.contadores.set(chave, { tentativas: 1, expiraEm: agora + opcoes.janelaMs });
      return true;
    }

    if (contador.tentativas >= opcoes.limite) {
      const restanteSegundos = Math.ceil((contador.expiraEm - agora) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Muitas tentativas. Tente novamente em ${restanteSegundos}s.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    contador.tentativas++;
    return true;
  }

  /** Evita crescimento ilimitado do Map sem precisar de um timer separado. */
  private limparEntradasVencidasOcasionalmente() {
    const agora = Date.now();
    if (agora - this.ultimaLimpeza < 60_000) return;
    this.ultimaLimpeza = agora;

    for (const [chave, contador] of this.contadores) {
      if (contador.expiraEm <= agora) this.contadores.delete(chave);
    }
  }
}

function extrairIp(req: { ip?: string; headers?: Record<string, unknown> }): string {
  // Atras do proxy do nginx/Traefik, req.ip so e confiavel se `trust proxy`
  // estiver ligado (ver main.ts) — sem isso, todo mundo apareceria com o IP
  // do proxy, e o limite valeria para TODOS os visitantes juntos.
  return req.ip ?? 'desconhecido';
}
