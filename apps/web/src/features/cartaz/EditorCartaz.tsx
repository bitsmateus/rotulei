/**
 * Editor de cartaz — formulario + previa ao vivo + fila de impressao.
 *
 * O formulario e o CartazA4 nao se conhecem: o formulario so edita um objeto
 * Cartaz, e o CartazA4 so le esse objeto. Mesma separacao do MVP, e o que
 * permite trocar a interface sem tocar no motor de renderizacao.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  CARTAZ_ALTURA_PX,
  CARTAZ_LARGURA_PX,
  FONTES,
  MODELOS_PRONTOS,
  TEMAS,
  cartazVazio,
  escalaDaPrevia,
  type Cartaz,
  type PatchLayout,
} from '@rotulei/shared';
import { CartazA4 } from './CartazA4';
import { useFontesDoCartaz } from './fontes';
import { useFilaDeImpressao, useImpressao } from './useFilaDeImpressao';
import './editor.css';
import './fontes.css';
import './impressao.css';

const AJUSTES: readonly { campo: keyof Cartaz; rotulo: string }[] = [
  { campo: 'ajusteNome', rotulo: 'Titulo' },
  { campo: 'ajusteSubtitulo', rotulo: 'Subtitulo' },
  { campo: 'ajusteFaixa', rotulo: 'Faixa' },
  { campo: 'ajustePreco', rotulo: 'Preco' },
  { campo: 'ajustePeso', rotulo: 'Peso' },
];

const INTERRUPTORES: readonly { campo: keyof Cartaz; rotulo: string }[] = [
  { campo: 'mostrarFaixa', rotulo: 'Faixa no topo' },
  { campo: 'mostrarDePor', rotulo: 'Preco antigo riscado (de/por)' },
  { campo: 'mostrarLogo', rotulo: 'Logo da loja' },
  { campo: 'mostrarBolinhaPreco', rotulo: 'Bolinha atras do preco' },
  { campo: 'mostrarPrecoAvulsoCaixa', rotulo: 'Avulso / caixa / litro' },
];

export interface EditorCartazProps {
  logoUrl?: string | null;
  escopoFila: string;
}

export function EditorCartaz({ logoUrl = null, escopoFila }: EditorCartazProps) {
  useFontesDoCartaz();

  const [cartaz, setCartaz] = useState<Cartaz>(() => cartazVazio(crypto.randomUUID()));
  const [escala, setEscala] = useState(() => escalaDaPrevia(window.innerWidth));
  const { fila, adicionar, remover, limpar } = useFilaDeImpressao(escopoFila);
  const { paraImprimir, imprimir } = useImpressao();

  useEffect(() => {
    const aoRedimensionar = () => setEscala(escalaDaPrevia(window.innerWidth));
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  const editar = useCallback(<C extends keyof Cartaz>(campo: C, valor: Cartaz[C]) => {
    setCartaz((atual) => ({ ...atual, [campo]: valor }));
  }, []);

  /** Mescla por cima do cartaz atual, preservando nome/preco ja digitados. */
  const aplicarPatch = useCallback((patch: PatchLayout) => {
    setCartaz((atual) => ({ ...atual, ...patch }));
  }, []);

  const texto = (campo: keyof Cartaz, rotulo: string, multilinha = false) => (
    <div className="editor-campo" key={campo}>
      <label htmlFor={campo}>{rotulo}</label>
      {multilinha ? (
        <textarea
          id={campo}
          rows={2}
          value={String(cartaz[campo] ?? '')}
          onChange={(e) => editar(campo, e.target.value as never)}
        />
      ) : (
        <input
          id={campo}
          value={String(cartaz[campo] ?? '')}
          onChange={(e) => editar(campo, e.target.value as never)}
        />
      )}
    </div>
  );

  return (
    <>
      <div className="tela editor-grid">
        {/* ── formulario ──────────────────────────────────────────────────── */}
        <div>
          <h2 style={{ marginTop: 0 }}>Novo cartaz</h2>

          <section>
            <h3>Modelos prontos</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {MODELOS_PRONTOS.map((m) => (
                <button key={m.id} type="button" onClick={() => aplicarPatch(m.patch)}>
                  {m.nome}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Produto</h3>
            {texto('produto', 'Titulo', true)}
            {texto('subtitulo', 'Subtitulo (opcional)', true)}
            <div className="editor-pares">
              {texto('peso', 'Peso / medida')}
              {texto('unidade', 'Unidade (cada, kg, un)')}
            </div>
            <div className="editor-pares">
              {texto('preco', 'Preco')}
              {texto('precoDe', 'Preco antigo')}
            </div>
            {texto('minUnidades', 'A partir de N unidades')}
          </section>

          {cartaz.mostrarPrecoAvulsoCaixa && (
            <section>
              <h3>Avulso / caixa / litro</h3>
              <div className="editor-pares">
                {texto('precoAvulso', 'Preco avulso')}
                {texto('precoLitro', 'Preco por litro')}
              </div>
              <div className="editor-pares">
                {texto('caixaQtd', 'Unidades na caixa')}
                {texto('caixaPreco', 'Preco da caixa')}
              </div>
            </section>
          )}

          <section>
            <h3>Aparencia</h3>
            {texto('textoFaixa', 'Texto da faixa')}

            <div className="editor-campo">
              <label>Cor</label>
              <div className="editor-cores">
                {TEMAS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="editor-cor"
                    aria-label={t.nome}
                    aria-pressed={cartaz.temaId === t.id}
                    style={{ background: t.faixaFundo }}
                    onClick={() => editar('temaId', t.id)}
                  />
                ))}
              </div>
            </div>

            <div className="editor-campo">
              <label htmlFor="fonte">Fonte</label>
              <select
                id="fonte"
                value={cartaz.fonte}
                onChange={(e) => editar('fonte', e.target.value)}
              >
                {FONTES.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>

            {INTERRUPTORES.map(({ campo, rotulo }) => (
              <label className="editor-check" key={campo}>
                <input
                  type="checkbox"
                  checked={Boolean(cartaz[campo])}
                  onChange={(e) => editar(campo, e.target.checked as never)}
                />
                {rotulo}
              </label>
            ))}
          </section>

          <section>
            <h3>Ajuste fino de tamanho</h3>
            {AJUSTES.map(({ campo, rotulo }) => (
              <div className="editor-campo" key={campo}>
                <label htmlFor={campo}>
                  {rotulo}: {Number(cartaz[campo]) > 0 ? '+' : ''}
                  {String(cartaz[campo])}
                </label>
                <input
                  id={campo}
                  type="range"
                  min={-3}
                  max={3}
                  step={1}
                  value={Number(cartaz[campo])}
                  onChange={(e) => editar(campo, Number(e.target.value) as never)}
                />
              </div>
            ))}
          </section>
        </div>

        {/* ── previa + fila ───────────────────────────────────────────────── */}
        <div className="editor-previa">
          <div
            style={{
              width: CARTAZ_LARGURA_PX * escala,
              height: CARTAZ_ALTURA_PX * escala,
              overflow: 'hidden',
              boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
            }}
          >
            <CartazA4 cartaz={cartaz} logoUrl={logoUrl} escala={escala} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => imprimir([cartaz])}>
              Imprimir
            </button>
            <button type="button" onClick={() => adicionar(cartaz)}>
              + Adicionar a fila
            </button>
          </div>

          {fila.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ marginBottom: 8 }}>Fila ({fila.length})</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {fila.map((c) => (
                  <li
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '7px 0',
                    }}
                  >
                    <span>{c.produto || '(sem titulo)'}</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => setCartaz(c)}>
                        Abrir
                      </button>
                      <button type="button" onClick={() => remover(c.id)}>
                        Remover
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => imprimir(fila)}>
                  Imprimir fila
                </button>
                <button type="button" onClick={limpar}>
                  Limpar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Escondida na tela, e o unico bloco que aparece no papel. */}
      <div className="area-impressao">
        {paraImprimir.map((c) => (
          <CartazA4 key={c.id} cartaz={c} logoUrl={logoUrl} escala={1} />
        ))}
      </div>
    </>
  );
}
