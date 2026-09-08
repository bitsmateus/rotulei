/**
 * CartazA4 — porte do componente do MVP do Mercado Nunes.
 *
 * PORTE, NAO REPROJETO. Cada numero aqui veio do handoff tecnico e ja foi
 * validado com o cliente na gondola. Antes de "melhorar" qualquer medida, leia
 * a secao 08 do handoff: a margem de 56px acima do preco parece exagerada e nao
 * e — foi medida no pior caso (titulo + subtitulo + 2 linhas de peso).
 *
 * O componente e puro: dados entram, JSX sai. Nao conhece tenant, nao busca
 * nada, nao guarda estado. E isso que permite usar o MESMO elemento na previa
 * (com transform: scale) e na impressao (tamanho real) — por isso a previa bate
 * pixel a pixel com o papel.
 *
 * Estilo 100% inline, como no original: mantem o componente portavel e imune a
 * qualquer CSS global que o app venha a ter.
 */
import type { CSSProperties } from 'react';
import {
  CARTAZ_ALTURA_PX,
  CARTAZ_LARGURA_PX,
  BASE_SUBTITULO,
  BASE_TITULO,
  PRECO_LINE_HEIGHT,
  PRECO_MARGEM_BASE,
  PRECO_MARGEM_TOPO,
  PROPORCAO_CENTAVOS,
  escalar,
  partirPreco,
  tamanhoTexto,
  temaPorId,
  type Cartaz,
} from '@rotulei/shared';

export interface CartazA4Props {
  cartaz: Cartaz;
  /** URL da logo do tenant. Sem logo, o bloco simplesmente nao aparece. */
  logoUrl?: string | null;
  /** Escala da previa. 1 = tamanho real (usado na impressao). */
  escala?: number;
}

export function CartazA4({ cartaz, logoUrl, escala = 1 }: CartazA4Props) {
  const tema = temaPorId(cartaz.temaId);
  const fonte = `'${cartaz.fonte}', system-ui, sans-serif`;

  const tamanhoTitulo = tamanhoTexto(cartaz.produto, cartaz.ajusteNome, BASE_TITULO);
  const tamanhoSubtitulo = tamanhoTexto(cartaz.subtitulo, cartaz.ajusteSubtitulo, BASE_SUBTITULO);
  const tamanhoFaixa = escalar(64, cartaz.ajusteFaixa);
  const tamanhoPeso = escalar(46, cartaz.ajustePeso);
  const tamanhoPreco = escalar(210, cartaz.ajustePreco);

  const { inteiro, centavos } = partirPreco(cartaz.preco);

  const folha: CSSProperties = {
    width: CARTAZ_LARGURA_PX,
    height: CARTAZ_ALTURA_PX,
    background: '#FFFFFF',
    border: `14px solid ${tema.borda}`,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: fonte,
    color: '#111111',
    overflow: 'hidden',
    // A previa escala o MESMO elemento que vai para a impressora.
    transform: escala === 1 ? undefined : `scale(${escala})`,
    transformOrigin: 'top left',
    // Sem isto o navegador "economiza tinta" e imprime a faixa em cinza claro.
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  };

  return (
    <div className="cartaz-a4" style={folha}>
      {cartaz.mostrarFaixa && (
        <div
          style={{
            background: tema.faixaFundo,
            color: tema.faixaTexto,
            fontSize: tamanhoFaixa,
            lineHeight: 1.1,
            textAlign: 'center',
            padding: '18px 16px',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {cartaz.textoFaixa}
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '24px 34px',
          minHeight: 0,
        }}
      >
        {/* ── titulo / subtitulo ─────────────────────────────────────────── */}
        <div
          style={{
            fontSize: tamanhoTitulo,
            lineHeight: 1.02,
            textAlign: 'center',
            textTransform: 'uppercase',
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
          }}
        >
          {cartaz.produto}
        </div>

        {cartaz.subtitulo && (
          <div
            style={{
              fontSize: tamanhoSubtitulo,
              lineHeight: 1.02,
              textAlign: 'center',
              textTransform: 'uppercase',
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
              marginTop: 6,
            }}
          >
            {cartaz.subtitulo}
          </div>
        )}

        {/* ── peso + "a partir de X un" ──────────────────────────────────── */}
        {(cartaz.peso || cartaz.minUnidades) && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            {cartaz.peso && (
              <div
                style={{
                  display: 'inline-block',
                  background: tema.faixaFundo,
                  color: tema.peso,
                  fontSize: tamanhoPeso,
                  lineHeight: 1.15,
                  padding: '6px 22px',
                  borderRadius: 8,
                  textTransform: 'uppercase',
                }}
              >
                {cartaz.peso}
              </div>
            )}
            {cartaz.minUnidades && (
              <div
                style={{
                  fontSize: Math.round(tamanhoPeso * 0.62),
                  lineHeight: 1.2,
                  marginTop: 8,
                  color: '#333333',
                  textTransform: 'uppercase',
                }}
              >
                A partir de {cartaz.minUnidades} un
              </div>
            )}
          </div>
        )}

        {/* ── de/por ─────────────────────────────────────────────────────── */}
        {cartaz.mostrarDePor && cartaz.precoDe && (
          <div
            style={{
              textAlign: 'center',
              fontSize: Math.round(tamanhoPreco * 0.24),
              color: '#555555',
              textDecoration: 'line-through',
              marginTop: 18,
            }}
          >
            De R$ {cartaz.precoDe}
          </div>
        )}

        {/* ── preco gigante + bolinha ────────────────────────────────────── */}
        {/*
          A folga de 56px NAO e opcional: line-height 0.86 faz os numeros
          vazarem visualmente para fora da caixa sem aumentar a altura
          computada dela. Com 28px (a primeira tentativa) o vazamento cortava
          a linha de "a partir de X un" quando havia titulo + subtitulo.
        */}
        <div
          style={{
            position: 'relative',
            textAlign: 'center',
            marginTop: PRECO_MARGEM_TOPO,
            marginBottom: PRECO_MARGEM_BASE,
          }}
        >
          {cartaz.mostrarBolinhaPreco && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                // Menos estouro vertical, mais horizontal -> oval largo,
                // nao um circulo.
                inset: '-4% -14%',
                background: '#FFD200', // amarelo fixo, independe do tema
                borderRadius: '48% 52% 45% 55% / 55% 45% 58% 42%',
                transform: 'rotate(-3deg)',
                zIndex: 0,
              }}
            />
          )}

          <div
            style={{
              position: 'relative',
              zIndex: 1,
              color: tema.preco,
              fontSize: tamanhoPreco,
              lineHeight: PRECO_LINE_HEIGHT,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: Math.round(tamanhoPreco * 0.3), marginTop: '0.35em' }}>
              R$
            </span>
            <span>{inteiro}</span>
            {centavos && (
              <>
                <span>,</span>
                <span
                  style={{
                    fontSize: Math.round(tamanhoPreco * PROPORCAO_CENTAVOS),
                    marginTop: '0.12em',
                  }}
                >
                  {centavos}
                </span>
              </>
            )}
          </div>

          {cartaz.unidade && (
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                textAlign: 'right',
                fontSize: Math.round(tamanhoPreco * 0.16),
                color: tema.preco,
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              {cartaz.unidade}
            </div>
          )}
        </div>

        {/* ── avulso / caixa / litro ─────────────────────────────────────── */}
        {/* Nasceu de um caso real: cerveja em lata avulsa e em caixa de 12,
            com o valor por litro calculado a parte para comparacao. */}
        {cartaz.mostrarPrecoAvulsoCaixa && (
          <div
            style={{
              textAlign: 'right',
              fontSize: 26,
              lineHeight: 1.35,
              color: '#333333',
              marginTop: 4,
            }}
          >
            {cartaz.precoAvulso && <div>{cartaz.precoAvulso} avulsa</div>}
            {cartaz.caixaPreco && (
              <div>
                Cx{cartaz.caixaQtd} = {cartaz.caixaPreco}
              </div>
            )}
            {cartaz.precoLitro && <div>R$ {cartaz.precoLitro} por litro</div>}
          </div>
        )}
      </div>

      {cartaz.mostrarLogo && logoUrl && (
        <div style={{ textAlign: 'center', padding: '0 24px 20px', flexShrink: 0 }}>
          <img src={logoUrl} alt="" style={{ maxHeight: 88, maxWidth: '60%' }} />
        </div>
      )}
    </div>
  );
}
