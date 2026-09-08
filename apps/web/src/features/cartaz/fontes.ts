import { useEffect } from 'react';
import { FONTES, URL_GOOGLE_FONTS } from '@rotulei/shared';

/**
 * Carrega as fontes do Google usadas pelo cartaz — injeta um <link> ao montar e
 * remove ao desmontar, para que o resto do app nao baixe essas familias a toa.
 * Mesma estrategia do MVP.
 */
export function useFontesDoCartaz() {
  useEffect(() => {
    const existente = document.querySelector<HTMLLinkElement>('link[data-rotulei-fontes]');
    if (existente) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = URL_GOOGLE_FONTS;
    link.dataset.rotuleiFontes = 'true';
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, []);
}

export const FONTES_SELF_HOSTED = FONTES.filter((f) => f.origem === 'self-hosted');
