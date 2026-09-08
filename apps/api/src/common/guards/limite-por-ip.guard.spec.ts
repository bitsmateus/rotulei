/**
 * Teste direto do guard, sem subir servidor nenhum.
 *
 * Roda dentro do worker do vitest, que seta NODE_ENV=test sozinho — por isso
 * o guard NAO se desliga por NODE_ENV (ver comentario em env.ts): a valvula
 * de desligar e DESABILITAR_LIMITES, exclusiva do processo que test/servidor.ts
 * sobe para a suite de e2e. Aqui, sem essa variavel, o limite fica ativo de
 * verdade — e o que permite testar a logica.
 */
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { CHAVE_LIMITE, LimitePorIpGuard, type LimitePorIp } from './limite-por-ip.guard';

function contextoFalso(opcoes: {
  ip: string;
  handler?: object;
  metadata?: LimitePorIp;
}): ExecutionContext {
  const handler = opcoes.handler ?? function alvoDeTeste() {};
  if (opcoes.metadata) Reflect.defineMetadata(CHAVE_LIMITE, opcoes.metadata, handler);

  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ ip: opcoes.ip }),
    }),
  } as unknown as ExecutionContext;
}

describe('LimitePorIpGuard', () => {
  it('deixa passar rota sem @LimitarPorIp, sem contar nada', () => {
    const guard = new LimitePorIpGuard(new Reflector());
    const ctx = contextoFalso({ ip: '1.1.1.1' }); // sem metadata
    for (let i = 0; i < 100; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('permite ate o limite, e barra a tentativa seguinte com 429', () => {
    const guard = new LimitePorIpGuard(new Reflector());
    const handler = function rotaLimitada() {};
    const opcoes: LimitePorIp = { limite: 3, janelaMs: 60_000 };
    const ctx = contextoFalso({ ip: '2.2.2.2', handler, metadata: opcoes });

    expect(guard.canActivate(ctx)).toBe(true); // 1
    expect(guard.canActivate(ctx)).toBe(true); // 2
    expect(guard.canActivate(ctx)).toBe(true); // 3
    expect(() => guard.canActivate(ctx)).toThrow(HttpException); // 4 — estourou
  });

  it('o erro e 429, com mensagem informando quando tentar de novo', () => {
    const guard = new LimitePorIpGuard(new Reflector());
    const handler = function rotaLimitada2() {};
    const ctx = contextoFalso({ ip: '3.3.3.3', handler, metadata: { limite: 1, janelaMs: 60_000 } });

    guard.canActivate(ctx);

    let capturado: HttpException | undefined;
    try {
      guard.canActivate(ctx);
    } catch (erro) {
      capturado = erro as HttpException;
    }

    expect(capturado).toBeInstanceOf(HttpException);
    const resposta = capturado!.getResponse() as { statusCode: number; message: string };
    expect(resposta.statusCode).toBe(429);
    expect(resposta.message).toMatch(/tente novamente/i);
  });

  it('IPs diferentes tem contadores independentes', () => {
    const guard = new LimitePorIpGuard(new Reflector());
    const handler = function rotaCompartilhada() {};
    const opcoes: LimitePorIp = { limite: 1, janelaMs: 60_000 };

    expect(guard.canActivate(contextoFalso({ ip: '4.4.4.4', handler, metadata: opcoes }))).toBe(true);
    // IP diferente, MESMO handler: nao deveria herdar o contador do primeiro.
    expect(guard.canActivate(contextoFalso({ ip: '5.5.5.5', handler, metadata: opcoes }))).toBe(true);
    // mas o 4.4.4.4 de novo ja estoura
    expect(() =>
      guard.canActivate(contextoFalso({ ip: '4.4.4.4', handler, metadata: opcoes })),
    ).toThrow(HttpException);
  });

  it('rotas diferentes (handlers diferentes) tem contadores independentes para o mesmo IP', () => {
    const guard = new LimitePorIpGuard(new Reflector());
    const opcoes: LimitePorIp = { limite: 1, janelaMs: 60_000 };
    const handlerA = function rotaA() {};
    const handlerB = function rotaB() {};

    expect(guard.canActivate(contextoFalso({ ip: '6.6.6.6', handler: handlerA, metadata: opcoes }))).toBe(true);
    // mesmo IP, rota diferente — nao deveria estar limitado ainda.
    expect(guard.canActivate(contextoFalso({ ip: '6.6.6.6', handler: handlerB, metadata: opcoes }))).toBe(true);
  });

  it('a janela expira e libera de novo', async () => {
    const guard = new LimitePorIpGuard(new Reflector());
    const handler = function rotaComJanelaCurta() {};
    const ctx = contextoFalso({ ip: '7.7.7.7', handler, metadata: { limite: 1, janelaMs: 30 } });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);

    await new Promise((r) => setTimeout(r, 50)); // espera a janela de 30ms passar

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('sem IP identificavel, ainda assim conta (nao quebra, nao libera geral)', () => {
    const guard = new LimitePorIpGuard(new Reflector());
    const handler = function rotaSemIp() {};
    Reflect.defineMetadata(CHAVE_LIMITE, { limite: 1, janelaMs: 60_000 }, handler);
    const ctx = {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({}) }), // sem .ip
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });
});
