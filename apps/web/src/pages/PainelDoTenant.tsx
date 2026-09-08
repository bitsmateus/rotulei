import { useEffect, useState } from 'react';
import {
  ErroDaApi,
  arquivoParaDataUrl,
  criarLoja,
  criarUsuarioDoTenant,
  editarLoja,
  editarMarca,
  editarUsuarioDoTenant,
  listarLojas,
  listarUsuariosDoTenant,
  obterMarca,
  removerLoja,
  removerUsuarioDoTenant,
  type Loja,
  type Marca,
  type UsuarioDoTenant,
} from '../lib/api';

/**
 * Painel do tenant — ESCOPO.md, secao "Painel do tenant" (item 7): lojas,
 * usuarios, marca propria. So o admin acessa (rota /painel, RotaProtegida
 * papeis={['admin']}); operador nao mexe em nada disso.
 *
 * Biblioteca de layouts salvos e assinatura/upgrade de plano ficam fora desta
 * fatia — a primeira ainda nao tem tela nenhuma no editor de cartaz, a
 * segunda ja tem tela propria (BloqueioAssinatura).
 */
export function PainelDoTenant() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [lojas, setLojas] = useState<Loja[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioDoTenant[]>([]);
  const [marca, setMarca] = useState<Marca | null>(null);

  async function recarregar() {
    const [l, u, m] = await Promise.all([listarLojas(), listarUsuariosDoTenant(), obterMarca()]);
    setLojas(l);
    setUsuarios(u);
    setMarca(m);
  }

  useEffect(() => {
    recarregar()
      .catch(() => setErro('Não foi possível carregar o painel.'))
      .finally(() => setCarregando(false));
  }, []);

  function relatarErro(falha: unknown, padrao: string) {
    setErro(falha instanceof ErroDaApi ? falha.message : padrao);
  }

  if (carregando) return <div style={{ padding: 32 }}>Carregando painel…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Painel do mercado</h1>
      <p style={{ color: 'var(--suave)', marginTop: 0 }}>Lojas, usuários e marca própria.</p>

      {erro && (
        <p role="alert" style={{ color: 'var(--acento)', fontSize: 14 }}>
          {erro}
        </p>
      )}

      <SecaoLojas
        lojas={lojas}
        onCriada={(l) => setLojas((a) => [...a, l])}
        onEditada={(l) => setLojas((a) => a.map((x) => (x.id === l.id ? l : x)))}
        onRemovida={(id) => setLojas((a) => a.filter((x) => x.id !== id))}
        onErro={relatarErro}
      />

      <SecaoUsuarios
        usuarios={usuarios}
        lojas={lojas}
        onCriado={(u) => setUsuarios((a) => [...a, u])}
        onEditado={(u) => setUsuarios((a) => a.map((x) => (x.id === u.id ? u : x)))}
        onRemovido={(id) => setUsuarios((a) => a.filter((x) => x.id !== id))}
        onErro={relatarErro}
      />

      {marca && <SecaoMarca marca={marca} onAtualizada={setMarca} onErro={relatarErro} />}
    </div>
  );
}

// ── lojas ────────────────────────────────────────────────────────────────────

function SecaoLojas({
  lojas,
  onCriada,
  onEditada,
  onRemovida,
  onErro,
}: {
  lojas: Loja[];
  onCriada: (l: Loja) => void;
  onEditada: (l: Loja) => void;
  onRemovida: (id: string) => void;
  onErro: (falha: unknown, padrao: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [criando, setCriando] = useState(false);

  async function criar() {
    if (!nome.trim()) return;
    setCriando(true);
    try {
      const loja = await criarLoja({ nome: nome.trim(), endereco: endereco.trim() || null });
      onCriada(loja);
      setNome('');
      setEndereco('');
    } catch (falha) {
      onErro(falha, 'Não foi possível criar a loja.');
    } finally {
      setCriando(false);
    }
  }

  async function remover(loja: Loja) {
    if (!window.confirm(`Remover a loja "${loja.nome}"? Os cartazes dela continuam existindo, sem loja associada.`)) {
      return;
    }
    try {
      await removerLoja(loja.id);
      onRemovida(loja.id);
    } catch (falha) {
      onErro(falha, 'Não foi possível remover a loja.');
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16 }}>Lojas ({lojas.length})</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--borda)' }}>
              <th style={{ padding: 8 }}>Nome</th>
              <th style={{ padding: 8 }}>Endereço</th>
              <th style={{ padding: 8 }} />
            </tr>
          </thead>
          <tbody>
            {lojas.map((l) => (
              <LinhaLoja key={l.id} loja={l} onEditada={onEditada} onRemover={() => remover(l)} onErro={onErro} />
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input placeholder="Nome da loja" value={nome} onChange={(e) => setNome(e.target.value)} style={{ fontSize: 13, padding: '6px 8px' }} />
        <input placeholder="Endereço (opcional)" value={endereco} onChange={(e) => setEndereco(e.target.value)} style={{ fontSize: 13, padding: '6px 8px', flex: 1, minWidth: 160 }} />
        <button type="button" disabled={criando || !nome.trim()} onClick={criar}>
          Adicionar loja
        </button>
      </div>
    </section>
  );
}

function LinhaLoja({
  loja,
  onEditada,
  onRemover,
  onErro,
}: {
  loja: Loja;
  onEditada: (l: Loja) => void;
  onRemover: () => void;
  onErro: (falha: unknown, padrao: string) => void;
}) {
  const [nome, setNome] = useState(loja.nome);
  const [endereco, setEndereco] = useState(loja.endereco ?? '');

  async function salvar() {
    if (nome === loja.nome && endereco === (loja.endereco ?? '')) return;
    try {
      onEditada(await editarLoja(loja.id, { nome, endereco: endereco.trim() || null }));
    } catch (falha) {
      onErro(falha, 'Não foi possível salvar a loja.');
      setNome(loja.nome);
      setEndereco(loja.endereco ?? '');
    }
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--borda)' }}>
      <td style={{ padding: 8 }}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvar} style={{ fontSize: 13, padding: '4px 6px' }} />
      </td>
      <td style={{ padding: 8 }}>
        <input value={endereco} onChange={(e) => setEndereco(e.target.value)} onBlur={salvar} style={{ fontSize: 13, padding: '4px 6px', width: '100%' }} />
      </td>
      <td style={{ padding: 8 }}>
        <button type="button" onClick={onRemover}>
          Remover
        </button>
      </td>
    </tr>
  );
}

// ── usuários ─────────────────────────────────────────────────────────────────

function SecaoUsuarios({
  usuarios,
  lojas,
  onCriado,
  onEditado,
  onRemovido,
  onErro,
}: {
  usuarios: UsuarioDoTenant[];
  lojas: Loja[];
  onCriado: (u: UsuarioDoTenant) => void;
  onEditado: (u: UsuarioDoTenant) => void;
  onRemovido: (id: string) => void;
  onErro: (falha: unknown, padrao: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<'admin' | 'operador'>('operador');
  const [lojaId, setLojaId] = useState('');
  const [criando, setCriando] = useState(false);

  async function criar() {
    if (!nome.trim() || !email.trim() || senha.length < 10) return;
    setCriando(true);
    try {
      const usuario = await criarUsuarioDoTenant({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        papel,
        lojaId: papel === 'operador' && lojaId ? lojaId : null,
      });
      onCriado(usuario);
      setNome('');
      setEmail('');
      setSenha('');
      setLojaId('');
    } catch (falha) {
      onErro(falha, 'Não foi possível criar o usuário.');
    } finally {
      setCriando(false);
    }
  }

  async function remover(usuario: UsuarioDoTenant) {
    if (!window.confirm(`Remover "${usuario.nome}"? Ele perde o acesso imediatamente.`)) return;
    try {
      await removerUsuarioDoTenant(usuario.id);
      onRemovido(usuario.id);
    } catch (falha) {
      onErro(falha, 'Não foi possível remover o usuário.');
    }
  }

  const nomeDaLoja = (id: string | null) => lojas.find((l) => l.id === id)?.nome ?? '—';

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16 }}>Usuários ({usuarios.length})</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--borda)' }}>
              <th style={{ padding: 8 }}>Nome</th>
              <th style={{ padding: 8 }}>E-mail</th>
              <th style={{ padding: 8 }}>Papel</th>
              <th style={{ padding: 8 }}>Loja</th>
              <th style={{ padding: 8 }}>Ativo</th>
              <th style={{ padding: 8 }} />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <LinhaUsuario
                key={u.id}
                usuario={u}
                lojas={lojas}
                nomeDaLoja={nomeDaLoja}
                onEditado={onEditado}
                onRemover={() => remover(u)}
                onErro={onErro}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} style={{ fontSize: 13, padding: '6px 8px' }} />
        <input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} style={{ fontSize: 13, padding: '6px 8px' }} />
        <input placeholder="Senha (mín. 10 caracteres)" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} style={{ fontSize: 13, padding: '6px 8px' }} />
        <select value={papel} onChange={(e) => setPapel(e.target.value as 'admin' | 'operador')} style={{ fontSize: 13 }}>
          <option value="operador">Operador</option>
          <option value="admin">Admin</option>
        </select>
        {papel === 'operador' && (
          <select value={lojaId} onChange={(e) => setLojaId(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">Sem loja fixa</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        )}
        <button type="button" disabled={criando || !nome.trim() || !email.trim() || senha.length < 10} onClick={criar}>
          Adicionar usuário
        </button>
      </div>
    </section>
  );
}

function LinhaUsuario({
  usuario,
  lojas,
  nomeDaLoja,
  onEditado,
  onRemover,
  onErro,
}: {
  usuario: UsuarioDoTenant;
  lojas: Loja[];
  nomeDaLoja: (id: string | null) => string;
  onEditado: (u: UsuarioDoTenant) => void;
  onRemover: () => void;
  onErro: (falha: unknown, padrao: string) => void;
}) {
  async function mudarPapel(papel: 'admin' | 'operador') {
    try {
      onEditado(await editarUsuarioDoTenant(usuario.id, { papel }));
    } catch (falha) {
      onErro(falha, 'Não foi possível mudar o papel.');
    }
  }

  async function mudarLoja(lojaId: string) {
    try {
      onEditado(await editarUsuarioDoTenant(usuario.id, { lojaId: lojaId || null }));
    } catch (falha) {
      onErro(falha, 'Não foi possível mudar a loja.');
    }
  }

  async function alternarAtivo() {
    try {
      onEditado(await editarUsuarioDoTenant(usuario.id, { ativo: !usuario.ativo }));
    } catch (falha) {
      onErro(falha, 'Não foi possível atualizar o usuário.');
    }
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--borda)' }}>
      <td style={{ padding: 8 }}>{usuario.nome}</td>
      <td style={{ padding: 8 }}>{usuario.email}</td>
      <td style={{ padding: 8 }}>
        <select value={usuario.papel} onChange={(e) => mudarPapel(e.target.value as 'admin' | 'operador')} style={{ fontSize: 13 }}>
          <option value="operador">Operador</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td style={{ padding: 8 }}>
        {usuario.papel === 'operador' ? (
          <select value={usuario.lojaId ?? ''} onChange={(e) => mudarLoja(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">Sem loja fixa</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        ) : (
          nomeDaLoja(usuario.lojaId)
        )}
      </td>
      <td style={{ padding: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={usuario.ativo} onChange={alternarAtivo} />
          {usuario.ativo ? 'Sim' : 'Não'}
        </label>
      </td>
      <td style={{ padding: 8 }}>
        <button type="button" onClick={onRemover}>
          Remover
        </button>
      </td>
    </tr>
  );
}

// ── marca própria ────────────────────────────────────────────────────────────

function SecaoMarca({
  marca,
  onAtualizada,
  onErro,
}: {
  marca: Marca;
  onAtualizada: (m: Marca) => void;
  onErro: (falha: unknown, padrao: string) => void;
}) {
  const [corPrimaria, setCorPrimaria] = useState(marca.corPrimaria ?? '#f6902f');
  const [corSecundaria, setCorSecundaria] = useState(marca.corSecundaria ?? '#1c1c1c');
  const [salvando, setSalvando] = useState(false);

  async function trocarLogo(arquivo: File | null) {
    if (!arquivo) return;
    setSalvando(true);
    try {
      const logoDataUrl = await arquivoParaDataUrl(arquivo);
      onAtualizada(await editarMarca({ logoDataUrl }));
    } catch (falha) {
      onErro(falha, 'Não foi possível salvar o logo.');
    } finally {
      setSalvando(false);
    }
  }

  async function removerLogo() {
    setSalvando(true);
    try {
      onAtualizada(await editarMarca({ logoDataUrl: null }));
    } catch (falha) {
      onErro(falha, 'Não foi possível remover o logo.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarCores() {
    setSalvando(true);
    try {
      onAtualizada(await editarMarca({ corPrimaria, corSecundaria }));
    } catch (falha) {
      onErro(falha, 'Não foi possível salvar as cores.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section style={{ marginTop: 28, marginBottom: 40 }}>
      <h2 style={{ fontSize: 16 }}>Marca própria</h2>

      {!marca.marcaPropriaDisponivel && (
        <p style={{ color: 'var(--suave)', fontSize: 13 }}>
          Recurso disponível nos planos Rede e Enterprise. Faça upgrade para configurar logo e cores.
        </p>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--suave)', marginBottom: 6 }}>Logo</div>
          {marca.logoDataUrl ? (
            <img src={marca.logoDataUrl} alt="Logo do mercado" style={{ maxHeight: 80, maxWidth: 200, display: 'block', marginBottom: 8 }} />
          ) : (
            <div style={{ color: 'var(--suave)', fontSize: 13, marginBottom: 8 }}>Nenhum logo configurado.</div>
          )}
          {marca.marcaPropriaDisponivel && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={salvando}
                onChange={(e) => trocarLogo(e.target.files?.[0] ?? null)}
              />
              {marca.logoDataUrl && (
                <button type="button" disabled={salvando} onClick={removerLogo}>
                  Remover logo
                </button>
              )}
            </div>
          )}
        </div>

        {marca.marcaPropriaDisponivel && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--suave)', marginBottom: 6 }}>Cores</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
                Primária
                <input type="color" value={corPrimaria} onChange={(e) => setCorPrimaria(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
                Secundária
                <input type="color" value={corSecundaria} onChange={(e) => setCorSecundaria(e.target.value)} />
              </label>
              <button type="button" disabled={salvando} onClick={salvarCores} style={{ alignSelf: 'flex-end' }}>
                Salvar cores
              </button>
            </div>
            <p style={{ color: 'var(--suave)', fontSize: 11, maxWidth: 320 }}>
              A cor ainda não é aplicada automaticamente no cartaz — os temas do editor continuam os mesmos por
              enquanto. Fica guardada para quando essa integração existir.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
