import { config } from 'dotenv';
import { resolve } from 'node:path';

/** Raiz do monorepo — o .env fica la, compartilhado por api e web. */
export const raizDoRepo = resolve(import.meta.dirname, '../../../..');

config({ path: resolve(raizDoRepo, '.env'), quiet: true });

export function precisaDe(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(
      `Variavel de ambiente ${nome} nao definida. Copie .env.example para .env na raiz do repo.`,
    );
  }
  return valor;
}
