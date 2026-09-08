/**
 * Precos em CENTAVOS (integer), nunca em float — dinheiro em ponto flutuante
 * acumula erro de arredondamento na hora de fechar fatura.
 */
export interface Plano {
  id: string;
  codigo: string;
  nome: string;
  precoMensalCentavos: number;
  precoAnualCentavos: number | null;
  /**
   * Plano "Rede" cobra R$69 POR LOJA/mes; "Inicio" cobra valor fixo.
   * Sem esta flag o calculo de MRR do superadmin sai errado para redes.
   */
  precoPorLoja: boolean;
  /** null = sem limite (Enterprise). */
  limiteLojas: number | null;
  recursos: Record<string, unknown>;
  ativo: boolean;
}

/** Valor mensal do plano para um tenant com N lojas. */
export function mensalidadeCentavos(plano: Plano, qtdLojas: number): number {
  return plano.precoPorLoja
    ? plano.precoMensalCentavos * Math.max(qtdLojas, 1)
    : plano.precoMensalCentavos;
}
