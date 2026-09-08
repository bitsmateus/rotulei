/**
 * Testes do motor de cartaz.
 *
 * Estes testes existem para travar o PORTE contra regressao: cada numero
 * asseverado aqui vem do handoff tecnico do MVP, ja validado com o cliente.
 * Se um deles quebrar, ou o porte saiu errado ou alguem "melhorou" uma formula
 * que nao devia mudar.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_SUBTITULO,
  BASE_TITULO,
  CAMPOS_LAYOUT,
  CARTAZ_ALTURA_PX,
  CARTAZ_LARGURA_PX,
  FONTES,
  PRECO_MARGEM_TOPO,
  TEMAS,
  cartazVazio,
  escalar,
  escalaDaPrevia,
  extrairPatchLayout,
  partirPreco,
  tamanhoTexto,
  temaPorId,
} from '@rotulei/shared';

describe('dimensoes A4', () => {
  it('e A4 a 96dpi exatos', () => {
    // 210mm x 297mm a 96dpi. Arredondar aqui desalinha previa e papel.
    expect(CARTAZ_LARGURA_PX).toBe(794);
    expect(CARTAZ_ALTURA_PX).toBe(1123);
  });

  it('a escala da previa respeita o piso de 0.28 e o teto de 0.62', () => {
    // Piso: so abaixo de ~270px de janela (794 * 0.28 + 48).
    expect(escalaDaPrevia(200)).toBe(0.28);
    // Teto: a largura da previa e limitada a 620px, entao 620/794 = 0.78 ja
    // estoura o teto. Qualquer janela a partir de ~668px fica em 0.62.
    expect(escalaDaPrevia(700)).toBe(0.62);
    expect(escalaDaPrevia(4000)).toBe(0.62);
  });

  it('entre o piso e o teto, a escala acompanha a janela', () => {
    // 400 - 48 = 352, abaixo do limite de 620 -> 352/794
    expect(escalaDaPrevia(400)).toBeCloseTo(352 / 794, 5);
  });
});

describe('tamanho automatico de titulo/subtitulo', () => {
  it('texto curto usa a base cheia', () => {
    expect(tamanhoTexto('ARROZ', 0, BASE_TITULO)).toBe(108);
    expect(tamanhoTexto('ARROZ', 0, BASE_SUBTITULO)).toBe(90);
  });

  it('encolhe nos degraus do MVP conforme a maior linha cresce', () => {
    const degraus: [string, number][] = [
      ['A'.repeat(10), 108], // ainda na base
      ['A'.repeat(11), 96], // > 10
      ['A'.repeat(14), 84], // > 13
      ['A'.repeat(17), 72], // > 16
      ['A'.repeat(21), 60], // > 20
      ['A'.repeat(27), 50], // > 26
    ];
    for (const [texto, esperado] of degraus) {
      expect(tamanhoTexto(texto, 0, BASE_TITULO)).toBe(esperado);
    }
  });

  it('quatro linhas ou mais aplicam mais 18% de reducao', () => {
    expect(tamanhoTexto('A\nB\nC\nD', 0, BASE_TITULO)).toBe(Math.round(108 * 0.82));
  });

  it('o degrau considera a MAIOR linha, nao o total de caracteres', () => {
    // 3 linhas curtas somam mais de 26 caracteres, mas nenhuma linha passa de 10
    expect(tamanhoTexto('ARROZ\nFEIJAO\nMACARRAO', 0, BASE_TITULO)).toBe(108);
  });

  it('o ajuste manual e de 8% por passo, por cima do calculado', () => {
    expect(tamanhoTexto('ARROZ', 3, BASE_TITULO)).toBe(Math.round(108 * 1.24));
    expect(tamanhoTexto('ARROZ', -3, BASE_TITULO)).toBe(Math.round(108 * 0.76));
  });
});

describe('escala manual de faixa/peso/preco', () => {
  it('cada passo do slider e 10%', () => {
    expect(escalar(100, 0)).toBe(100);
    expect(escalar(100, 1)).toBe(110);
    expect(escalar(100, -3)).toBe(70);
    expect(escalar(210, 3)).toBe(273);
  });
});

describe('preco', () => {
  it('separa inteiro e centavos', () => {
    expect(partirPreco('22,99')).toEqual({ inteiro: '22', centavos: '99' });
  });

  it('aceita ponto como separador', () => {
    expect(partirPreco('22.99')).toEqual({ inteiro: '22', centavos: '99' });
  });

  it('preco sem centavos nao inventa centavos', () => {
    expect(partirPreco('15')).toEqual({ inteiro: '15', centavos: '' });
  });

  it('string vazia nao quebra', () => {
    expect(partirPreco('')).toEqual({ inteiro: '', centavos: '' });
  });

  it('a folga acima do preco continua em 56px', () => {
    // Nao reduzir: com 28px o vazamento do line-height 0.86 cortava a linha
    // de "a partir de X un" quando havia titulo + subtitulo.
    expect(PRECO_MARGEM_TOPO).toBe(56);
  });
});

describe('temas', () => {
  it('sao os 6 do MVP', () => {
    expect(TEMAS).toHaveLength(6);
    expect(TEMAS.map((t) => t.id)).toEqual([
      'laranja',
      'laranja-logo',
      'amarelo',
      'azul',
      'verde',
      'preto',
    ]);
  });

  it('"laranja da logo" e o unico em que preco e peso usam a cor da faixa', () => {
    const logo = temaPorId('laranja-logo');
    expect(logo.faixaFundo).toBe('#F6902F');
    expect(logo.preco).toBe(logo.faixaFundo);
    expect(logo.peso).toBe(logo.faixaFundo);

    for (const outro of TEMAS.filter((t) => t.id !== 'laranja-logo')) {
      expect(outro.peso).not.toBe(outro.faixaFundo);
    }
  });

  it('tema desconhecido cai no primeiro em vez de quebrar', () => {
    expect(temaPorId('nao-existe').id).toBe('laranja');
  });
});

describe('fontes', () => {
  it('sao 9 opcoes, 3 self-hosted e 6 do Google', () => {
    expect(FONTES).toHaveLength(9);
    expect(FONTES.filter((f) => f.origem === 'self-hosted')).toHaveLength(3);
    expect(FONTES.filter((f) => f.origem === 'google')).toHaveLength(6);
  });

  it('as self-hosted sao apenas o corte gratuito da TT Masters', () => {
    // A familia completa e paga. Se aparecer outra Masters aqui, alguem
    // embutiu arquivo licenciado sem querer.
    expect(FONTES.filter((f) => f.origem === 'self-hosted').map((f) => f.valor)).toEqual([
      'MastersBlack',
      'MastersBirds',
      'MastersRoughThin',
    ]);
  });
});

describe('layout salvo', () => {
  it('sao exatamente os 13 campos de estilo', () => {
    expect(CAMPOS_LAYOUT).toHaveLength(13);
  });

  it('nunca carrega conteudo do produto', () => {
    const cartaz = {
      ...cartazVazio('x'),
      produto: 'ARROZ',
      preco: '22,99',
      peso: '5 KG',
      temaId: 'azul' as const,
    };
    const patch = extrairPatchLayout(cartaz);

    // e o que faz um layout servir a qualquer produto novo
    expect(patch).not.toHaveProperty('produto');
    expect(patch).not.toHaveProperty('preco');
    expect(patch).not.toHaveProperty('peso');
    expect(patch.temaId).toBe('azul');
  });
});
