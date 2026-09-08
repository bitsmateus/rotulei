/**
 * O objeto Cartaz — portado do MVP do Mercado Nunes sem alteracao de contrato.
 *
 * Regra do escopo: isto e PORTE, nao reprojeto. Cada campo, cada default e cada
 * formula abaixo vem do handoff tecnico do MVP, que ja foi validado com o
 * cliente. Melhorar por conta propria aqui e risco puro.
 *
 * O que muda em relacao ao MVP: `tenantId`, `lojaId` e `criadoPor` (ver
 * CartazPersistido, no fim do arquivo). O nucleo de renderizacao nao sabe que
 * tenant existe.
 */

export interface Cartaz {
  id: string;

  // ── conteudo do produto ────────────────────────────────────────────────────
  /** Titulo — vira maiusculas na renderizacao, aceita quebra de linha. */
  produto: string;
  /** Opcional — 2a linha, com tamanho proprio. */
  subtitulo: string;
  /** Ex.: "800 G". */
  peso: string;
  /** Ex.: "22,99". String mesmo: e parseada so na hora de renderizar. */
  preco: string;
  /** Preco riscado, ex.: "27,80". */
  precoDe: string;
  /** Opcional — ex.: "CADA", "KG", "UN". */
  unidade: string;
  /** Opcional — "6" vira "A partir de 6 un". */
  minUnidades: string;
  precoAvulso: string;
  caixaQtd: string;
  caixaPreco: string;
  precoLitro: string;

  // ── aparencia / estilo ─────────────────────────────────────────────────────
  textoFaixa: string;
  mostrarFaixa: boolean;
  mostrarDePor: boolean;
  mostrarLogo: boolean;
  mostrarBolinhaPreco: boolean;
  mostrarPrecoAvulsoCaixa: boolean;
  temaId: TemaId;
  /** O valor e literalmente o CSS font-family. */
  fonte: string;

  // ── ajuste manual de tamanho, -3 a +3, cada peca independente ──────────────
  ajusteNome: number;
  ajusteSubtitulo: number;
  ajusteFaixa: number;
  ajustePreco: number;
  ajustePeso: number;
}

/**
 * Os 13 campos que entram num "layout salvo".
 *
 * So estilo. Conteudo (produto, preco, peso...) fica de fora de proposito: e o
 * que faz um layout servir para qualquer produto novo, em vez de trazer junto o
 * nome e o preco de quem salvou primeiro.
 */
export const CAMPOS_LAYOUT = [
  'temaId',
  'fonte',
  'textoFaixa',
  'mostrarFaixa',
  'mostrarDePor',
  'mostrarLogo',
  'mostrarBolinhaPreco',
  'mostrarPrecoAvulsoCaixa',
  'ajusteNome',
  'ajusteSubtitulo',
  'ajusteFaixa',
  'ajustePreco',
  'ajustePeso',
] as const satisfies readonly (keyof Cartaz)[];

export type CampoLayout = (typeof CAMPOS_LAYOUT)[number];
export type PatchLayout = Partial<Pick<Cartaz, CampoLayout>>;

/** Extrai de um cartaz apenas os campos de estilo. */
export function extrairPatchLayout(cartaz: Cartaz): PatchLayout {
  const patch: Record<string, unknown> = {};
  for (const campo of CAMPOS_LAYOUT) patch[campo] = cartaz[campo];
  return patch as PatchLayout;
}

// ── Dimensoes: A4 de verdade ─────────────────────────────────────────────────

/** A4 (210 x 297mm) a 96dpi exatos. Nao arredondar. */
export const CARTAZ_LARGURA_PX = 794;
export const CARTAZ_ALTURA_PX = 1123;

/**
 * Escala da previa em tela. A previa aplica `transform: scale()` no MESMO
 * elemento que vai para a impressora, por isso ela bate pixel a pixel com o
 * papel — nao e uma aproximacao.
 */
export function escalaDaPrevia(larguraDaJanela: number): number {
  const largura = Math.min(larguraDaJanela - 48, 620);
  return Math.min(0.62, Math.max(0.28, largura / CARTAZ_LARGURA_PX));
}

// ── Temas ────────────────────────────────────────────────────────────────────

export interface Tema {
  id: TemaId;
  nome: string;
  faixaFundo: string;
  faixaTexto: string;
  borda: string;
  preco: string;
  peso: string;
}

export type TemaId = 'laranja' | 'laranja-logo' | 'amarelo' | 'azul' | 'verde' | 'preto';

export const TEMAS: readonly Tema[] = [
  {
    id: 'laranja',
    nome: 'Laranja',
    faixaFundo: '#E7110D',
    faixaTexto: '#FFD200',
    borda: '#E7110D',
    preco: '#E7110D',
    peso: '#FFD200',
  },
  {
    // Amostrada do pixel dominante do arquivo real da logo (canvas headless +
    // contagem de frequencia), nao escolhida no olho.
    // Unico tema em que preco e peso usam a propria cor da faixa.
    id: 'laranja-logo',
    nome: 'Laranja da logo',
    faixaFundo: '#F6902F',
    faixaTexto: '#FFFFFF',
    borda: '#F6902F',
    preco: '#F6902F',
    peso: '#F6902F',
  },
  {
    id: 'amarelo',
    nome: 'Amarelo',
    faixaFundo: '#FFD200',
    faixaTexto: '#ED1C24',
    borda: '#FFD200',
    preco: '#ED1C24',
    peso: '#ED1C24',
  },
  {
    id: 'azul',
    nome: 'Azul',
    faixaFundo: '#0B5FBF',
    faixaTexto: '#FFD200',
    borda: '#0B5FBF',
    preco: '#0B5FBF',
    peso: '#FFD200',
  },
  {
    id: 'verde',
    nome: 'Verde',
    faixaFundo: '#1B8A3A',
    faixaTexto: '#FFD200',
    borda: '#1B8A3A',
    preco: '#1B8A3A',
    peso: '#FFD200',
  },
  {
    id: 'preto',
    nome: 'Preto',
    faixaFundo: '#111111',
    faixaTexto: '#FFD200',
    borda: '#111111',
    preco: '#111111',
    peso: '#FFD200',
  },
];

export function temaPorId(id: string): Tema {
  return TEMAS.find((t) => t.id === id) ?? TEMAS[0];
}

// ── Fontes ───────────────────────────────────────────────────────────────────

export interface FonteDisponivel {
  /** Valor gravado em Cartaz.fonte — e o proprio CSS font-family. */
  valor: string;
  nome: string;
  origem: 'self-hosted' | 'google';
}

/**
 * ATENCAO — licenca. A fonte do cartaz original do cliente (feito no Canva) e a
 * "TT Masters" completa, da TypeType, que e PAGA (um projeto = uma licenca).
 * As tres self-hosted abaixo sao o corte reduzido que a propria TypeType libera
 * sob SIL OFL — 3 dos 20 estilos da familia. "Masters Black" e a mais parecida
 * com o visual grosso/redondo do original e por isso e a padrao.
 *
 * Se o cliente comprar a licenca completa, basta trocar os arquivos .otf e
 * manter o mesmo @font-face.
 */
export const FONTES: readonly FonteDisponivel[] = [
  { valor: 'MastersBlack', nome: 'Masters Black', origem: 'self-hosted' },
  { valor: 'MastersBirds', nome: 'Masters Birds', origem: 'self-hosted' },
  { valor: 'MastersRoughThin', nome: 'Masters Rough Thin', origem: 'self-hosted' },
  { valor: 'Titan One', nome: 'Titan One', origem: 'google' },
  { valor: 'Baloo 2', nome: 'Baloo 2', origem: 'google' },
  { valor: 'Luckiest Guy', nome: 'Luckiest Guy', origem: 'google' },
  { valor: 'Bowlby One SC', nome: 'Bowlby One SC', origem: 'google' },
  { valor: 'Anton', nome: 'Anton', origem: 'google' },
  { valor: 'Archivo Black', nome: 'Archivo Black', origem: 'google' },
];

export const FONTE_PADRAO = 'MastersBlack';

/** URL do Google Fonts com exatamente as familias remotas da lista acima. */
export const URL_GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2?family=Titan+One&family=Baloo+2:wght@800' +
  '&family=Luckiest+Guy&family=Bowlby+One+SC&family=Anton&family=Archivo+Black&display=swap';

// ── Dimensionamento automatico de texto ──────────────────────────────────────

export const BASE_TITULO = 108;
export const BASE_SUBTITULO = 90;

/**
 * Tamanho do titulo/subtitulo: encolhe sozinho conforme o texto cresce, para
 * nunca estourar a folha, e ainda aceita o ajuste manual (-3 a +3) por cima.
 *
 * Os degraus sao os do MVP, expressos como fracao de 108 mesmo quando a base e
 * 90 (subtitulo) — e assim que o original se comporta.
 */
export function tamanhoTexto(texto: string, ajuste: number, baseMax: number): number {
  const linhas = texto.split('\n');
  const maiorLinha = linhas.reduce((max, l) => Math.max(max, l.length), 0);
  const totalLinhas = linhas.length;

  let base = baseMax;
  if (maiorLinha > 10) base = baseMax * (96 / 108);
  if (maiorLinha > 13) base = baseMax * (84 / 108);
  if (maiorLinha > 16) base = baseMax * (72 / 108);
  if (maiorLinha > 20) base = baseMax * (60 / 108);
  if (maiorLinha > 26) base = baseMax * (50 / 108);
  if (totalLinhas >= 4) base = base * 0.82;

  return Math.round(base * (1 + ajuste * 0.08));
}

/**
 * Para faixa, peso e preco — que nao tem texto de tamanho variavel do usuario,
 * so o ajuste manual. Cada passo do slider e +-10%.
 */
export function escalar(base: number, ajuste: number): number {
  return Math.round(base * (1 + ajuste * 0.1));
}

// ── Preco ────────────────────────────────────────────────────────────────────

export interface PrecoPartido {
  inteiro: string;
  centavos: string;
}

/**
 * "22,99" -> { inteiro: "22", centavos: "99" }.
 *
 * Os centavos sao renderizados a 60% do tamanho e sobem um pouco, imitando
 * etiqueta de preco de mercado de verdade.
 */
export function partirPreco(preco: string): PrecoPartido {
  const limpo = (preco ?? '').trim();
  const [inteiro = '', centavos = ''] = limpo.split(/[,.]/);
  return { inteiro, centavos };
}

/** Proporcao dos centavos em relacao ao corpo do preco. */
export const PROPORCAO_CENTAVOS = 0.6;

/**
 * O preco usa line-height 0.86 (mais apertado que o natural da fonte) para
 * colar os numeros. Isso faz o texto vazar visualmente para fora da propria
 * caixa sem aumentar a altura computada dela.
 *
 * Estas margens NAO sao chute: uma versao anterior usava 28px em cima, que
 * parecia bastar — ate um titulo + subtitulo ocupar mais linhas e o vazamento
 * cortar a linha de "a partir de X un". Medidas no pior caso (2 linhas de peso
 * + subtitulo + preco no tamanho padrao). Nao reduzir sem testar esse cenario.
 */
export const PRECO_MARGEM_TOPO = 56;
export const PRECO_MARGEM_BASE = 16;
export const PRECO_LINE_HEIGHT = 0.86;

// ── Modelos prontos ──────────────────────────────────────────────────────────

export interface ModeloPronto {
  id: string;
  nome: string;
  patch: PatchLayout;
}

/**
 * Combinacoes fixas aplicadas com um clique. Diferente dos "layouts salvos",
 * que o usuario cria e ficam no banco.
 */
export const MODELOS_PRONTOS: readonly ModeloPronto[] = [
  {
    id: 'oferta-de-por',
    nome: 'Oferta de/por',
    patch: { mostrarFaixa: true, textoFaixa: 'OFERTA', mostrarDePor: true, temaId: 'laranja' },
  },
  {
    id: 'oferta-simples',
    nome: 'Oferta simples',
    patch: { mostrarFaixa: true, textoFaixa: 'OFERTA', mostrarDePor: false, temaId: 'laranja' },
  },
  {
    id: 'sem-faixa',
    nome: 'Sem faixa',
    patch: { mostrarFaixa: false, textoFaixa: 'OFERTA', mostrarDePor: false, temaId: 'laranja' },
  },
  {
    id: 'super-oferta',
    nome: 'Super oferta',
    patch: { mostrarFaixa: true, textoFaixa: 'SUPER OFERTA', mostrarDePor: true, temaId: 'amarelo' },
  },
];

// ── Cartaz vazio ─────────────────────────────────────────────────────────────

export function cartazVazio(id: string): Cartaz {
  return {
    id,
    produto: '',
    subtitulo: '',
    peso: '',
    preco: '',
    precoDe: '',
    unidade: '',
    minUnidades: '',
    precoAvulso: '',
    caixaQtd: '12',
    caixaPreco: '',
    precoLitro: '',
    textoFaixa: 'OFERTA',
    mostrarFaixa: true,
    mostrarDePor: false,
    mostrarLogo: true,
    mostrarBolinhaPreco: true,
    mostrarPrecoAvulsoCaixa: false,
    temaId: 'laranja',
    fonte: FONTE_PADRAO,
    ajusteNome: 0,
    ajusteSubtitulo: 0,
    ajusteFaixa: 0,
    ajustePreco: 0,
    ajustePeso: 0,
  };
}

// ── Persistencia (o que muda em relacao ao MVP) ──────────────────────────────

export interface CartazPersistido extends Cartaz {
  tenantId: string;
  lojaId: string | null;
  criadoPor: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface LayoutSalvo {
  id: string;
  tenantId: string;
  nome: string;
  patch: PatchLayout;
  criadoPor: string | null;
  criadoEm: Date;
}
