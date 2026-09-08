import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSessao } from '../auth/AuthProvider';
import { ErroDaApi } from '../lib/api';

export function Entrar() {
  const { entrar } = useSessao();
  const navegar = useNavigate();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
      navegar('/', { replace: true });
    } catch (falha) {
      setErro(
        falha instanceof ErroDaApi ? falha.message : 'Não foi possível entrar. Tente de novo.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20 }}>
      <form
        onSubmit={enviar}
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--superficie)',
          border: '1px solid var(--borda)',
          borderRadius: 14,
          padding: 28,
        }}
      >
        <h1 style={{ fontSize: 26, marginBottom: 4 }}>Rotulei</h1>
        <p style={{ color: 'var(--suave)', marginTop: 0, marginBottom: 22 }}>
          Entre para criar suas placas de oferta.
        </p>

        <div className="editor-campo">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="editor-campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>

        {erro && (
          <p role="alert" style={{ color: 'var(--acento)', fontSize: 14, marginTop: 4 }}>
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          style={{
            width: '100%',
            marginTop: 10,
            background: 'var(--acento)',
            color: '#fff',
            borderColor: 'var(--acento)',
            fontWeight: 600,
          }}
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, marginTop: 16, marginBottom: 0 }}>
          Ainda não tem conta? <Link to="/cadastro">Teste grátis por 7 dias</Link>
        </p>
      </form>
    </div>
  );
}
