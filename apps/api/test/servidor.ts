/**
 * globalSetup do vitest: sobe a API COMPILADA numa porta de teste.
 *
 * Por que o dist e nao o codigo-fonte: o vitest transpila com esbuild, que nao
 * emite `emitDecoratorMetadata` — sem isso a injecao de dependencia do NestJS
 * chega undefined. Rodando o artefato construido, o teste exercita exatamente o
 * que vai para o EasyPanel, decoradores e tudo.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

const PORTA = 3399;
export const BASE = `http://localhost:${PORTA}/api`;

let servidor: ChildProcess | undefined;

async function esperarSubir(tentativas = 60): Promise<void> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`${BASE}/saude`);
      if (r.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`A API nao respondeu em ${BASE}/saude a tempo.`);
}

export async function setup() {
  const raiz = resolve(import.meta.dirname, '..');

  servidor = spawn(process.execPath, [resolve(raiz, 'dist/main.js')], {
    cwd: raiz,
    env: {
      ...process.env,
      PORT: String(PORTA),
      NODE_ENV: 'test',
      // A suite bate dezenas de vezes no cadastro publico a partir do mesmo
      // IP; sem isto, o proprio limite por IP derrubaria os testes.
      DESABILITAR_LIMITES: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let saida = '';
  servidor.stdout?.on('data', (d) => (saida += d));
  servidor.stderr?.on('data', (d) => (saida += d));
  servidor.on('exit', (codigo) => {
    if (codigo !== 0 && codigo !== null) {
      console.error(`API de teste morreu (codigo ${codigo}):\n${saida}`);
    }
  });

  await esperarSubir().catch((erro) => {
    console.error(saida);
    throw erro;
  });
}

export async function teardown() {
  servidor?.kill();
}
