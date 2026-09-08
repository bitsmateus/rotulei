import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cartazVazio, temaPorId, type Cartaz } from '@rotulei/shared';
import { CartazA4 } from './CartazA4';

/** jsdom normaliza cores para rgb(); converte "#0B5FBF" -> "rgb(11, 95, 191)". */
function hexParaRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function cartazDeTeste(sobrescreve: Partial<Cartaz> = {}): Cartaz {
  return {
    ...cartazVazio('teste'),
    produto: 'ARROZ TIPO 1',
    peso: '5 KG',
    preco: '22,99',
    ...sobrescreve,
  };
}

describe('CartazA4', () => {
  it('renderiza no tamanho A4 real quando a escala e 1', () => {
    const { container } = render(<CartazA4 cartaz={cartazDeTeste()} />);
    const folha = container.querySelector<HTMLElement>('.cartaz-a4')!;

    expect(folha.style.width).toBe('794px');
    expect(folha.style.height).toBe('1123px');
    // Sem transform na impressao: e o elemento em tamanho real que vai ao papel.
    expect(folha.style.transform).toBe('');
  });

  it('a previa escala o mesmo elemento em vez de renderizar outro', () => {
    const { container } = render(<CartazA4 cartaz={cartazDeTeste()} escala={0.5} />);
    const folha = container.querySelector<HTMLElement>('.cartaz-a4')!;

    expect(folha.style.width).toBe('794px');
    expect(folha.style.transform).toBe('scale(0.5)');
    expect(folha.style.transformOrigin).toBe('top left');
  });

  it('parte o preco em inteiro, virgula e centavos', () => {
    render(<CartazA4 cartaz={cartazDeTeste({ preco: '22,99' })} />);
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText(',')).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('preco sem centavos nao renderiza virgula solta', () => {
    render(<CartazA4 cartaz={cartazDeTeste({ preco: '15' })} />);
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.queryByText(',')).not.toBeInTheDocument();
  });

  it('a bolinha e amarelo fixo, independente do tema escolhido', () => {
    for (const temaId of ['laranja', 'azul', 'verde', 'preto'] as const) {
      const { container, unmount } = render(
        <CartazA4 cartaz={cartazDeTeste({ temaId, mostrarBolinhaPreco: true })} />,
      );
      const bolinha = container.querySelector<HTMLElement>('[aria-hidden="true"]')!;
      expect(bolinha.style.background).toBe('rgb(255, 210, 0)'); // #FFD200
      expect(bolinha.style.transform).toBe('rotate(-3deg)');
      unmount();
    }
  });

  it('a bolinha some quando desligada', () => {
    const { container } = render(
      <CartazA4 cartaz={cartazDeTeste({ mostrarBolinhaPreco: false })} />,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('aplica as cores do tema na faixa', () => {
    const tema = temaPorId('azul');
    const { container } = render(
      <CartazA4 cartaz={cartazDeTeste({ temaId: 'azul', textoFaixa: 'OFERTA' })} />,
    );
    const folha = container.querySelector<HTMLElement>('.cartaz-a4')!;

    expect(screen.getByText('OFERTA')).toBeInTheDocument();
    // borda do cartaz usa a cor do tema
    expect(folha.style.border).toContain(hexParaRgb(tema.borda));
  });

  it('esconde a faixa quando desligada', () => {
    render(<CartazA4 cartaz={cartazDeTeste({ mostrarFaixa: false, textoFaixa: 'OFERTA' })} />);
    expect(screen.queryByText('OFERTA')).not.toBeInTheDocument();
  });

  it('renderiza "a partir de X un"', () => {
    render(<CartazA4 cartaz={cartazDeTeste({ minUnidades: '6' })} />);
    expect(screen.getByText(/a partir de 6 un/i)).toBeInTheDocument();
  });

  it('renderiza o bloco avulso / caixa / litro', () => {
    render(
      <CartazA4
        cartaz={cartazDeTeste({
          mostrarPrecoAvulsoCaixa: true,
          precoAvulso: 'R$ 4,99',
          caixaQtd: '12',
          caixaPreco: 'R$ 54,90',
          precoLitro: '13,30',
        })}
      />,
    );
    expect(screen.getByText(/R\$ 4,99 avulsa/)).toBeInTheDocument();
    expect(screen.getByText(/Cx12 = R\$ 54,90/)).toBeInTheDocument();
    expect(screen.getByText(/13,30 por litro/)).toBeInTheDocument();
  });

  it('mostra o de/por so quando ligado E com preco antigo preenchido', () => {
    const { rerender } = render(
      <CartazA4 cartaz={cartazDeTeste({ mostrarDePor: true, precoDe: '27,80' })} />,
    );
    expect(screen.getByText(/De R\$ 27,80/)).toBeInTheDocument();

    rerender(<CartazA4 cartaz={cartazDeTeste({ mostrarDePor: true, precoDe: '' })} />);
    expect(screen.queryByText(/De R\$/)).not.toBeInTheDocument();
  });

  it('nao mostra logo sem URL, mesmo com a opcao ligada', () => {
    const { container } = render(
      <CartazA4 cartaz={cartazDeTeste({ mostrarLogo: true })} logoUrl={null} />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('forca a impressao de cores de fundo', () => {
    // Sem isto o navegador "economiza tinta" e a faixa sai cinza no papel.
    const { container } = render(<CartazA4 cartaz={cartazDeTeste()} />);
    const folha = container.querySelector<HTMLElement>('.cartaz-a4')!;
    expect(folha.style.printColorAdjust).toBe('exact');
  });
});
