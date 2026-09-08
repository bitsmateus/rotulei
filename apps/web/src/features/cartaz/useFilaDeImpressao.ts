import { useCallback, useEffect, useState } from 'react';
import type { Cartaz } from '@rotulei/shared';

/**
 * Fila de impressao — porte do MVP.
 *
 * Fica no localStorage, POR DISPOSITIVO. Nao e compartilhada entre usuarios,
 * diferente dos layouts salvos (que vao para o banco). Isso e proposital: a
 * fila e o que a pessoa vai imprimir agora, naquele computador da loja; nao faz
 * sentido o operador da Vila Moema herdar a fila do operador da Central.
 */
const CHAVE = 'rotulei:fila-de-impressao';

function ler(): Cartaz[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return [];
    const dados = JSON.parse(bruto);
    // Armadilha ja resolvida no MVP: um estado de lista NUNCA pode virar algo
    // que nao seja array — `fila.length` no render derrubava a pagina inteira
    // (tela branca) quando a fonte de dados devolvia formato inesperado.
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

export function useFilaDeImpressao() {
  const [fila, setFila] = useState<Cartaz[]>(ler);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(fila));
    } catch {
      // Modo privado / storage cheio: a fila segue funcionando em memoria.
    }
  }, [fila]);

  const adicionar = useCallback((cartaz: Cartaz) => {
    setFila((atual) => [...atual, { ...cartaz, id: crypto.randomUUID() }]);
  }, []);

  const remover = useCallback((id: string) => {
    setFila((atual) => atual.filter((c) => c.id !== id));
  }, []);

  const limpar = useCallback(() => setFila([]), []);

  return { fila, adicionar, remover, limpar };
}

/**
 * Impressao: preenche `paraImprimir`, espera as fontes/logo carregarem e chama
 * window.print(). O `afterprint` limpa o estado.
 *
 * Os 250ms nao sao superstica: sem eles a primeira impressao sai com a fonte
 * fallback, porque o @font-face ainda nao terminou de carregar quando o dialogo
 * abre. Onde disponivel, document.fonts.ready cobre o caso melhor — a espera
 * fixa fica como piso.
 */
export function useImpressao() {
  const [paraImprimir, setParaImprimir] = useState<Cartaz[]>([]);

  useEffect(() => {
    if (paraImprimir.length === 0) return;

    let cancelado = false;
    const aoTerminar = () => setParaImprimir([]);
    window.addEventListener('afterprint', aoTerminar);

    const fontesProntas = document.fonts?.ready ?? Promise.resolve();
    const espera = Promise.all([
      fontesProntas,
      new Promise((r) => setTimeout(r, 250)),
    ]);

    espera.then(() => {
      if (!cancelado) window.print();
    });

    return () => {
      cancelado = true;
      window.removeEventListener('afterprint', aoTerminar);
    };
  }, [paraImprimir]);

  return { paraImprimir, imprimir: setParaImprimir };
}
