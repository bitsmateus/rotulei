import { Navigate, Outlet } from 'react-router-dom';
import { useSessao } from './AuthProvider';
import type { UsuarioDaSessao } from '../lib/api';

interface Props {
  /** Se informado, apenas estes papeis entram. */
  papeis?: UsuarioDaSessao['papel'][];
}

export function RotaProtegida({ papeis }: Props) {
  const { usuario, carregando } = useSessao();

  if (carregando) return <div style={{ padding: 32 }}>Carregando…</div>;
  if (!usuario) return <Navigate to="/entrar" replace />;

  // Esta checagem e conveniencia de navegacao, nao seguranca: quem protege de
  // verdade e o guard da API e o RLS. Aqui so evita mostrar uma tela que o
  // usuario nao conseguiria usar.
  if (papeis && !papeis.includes(usuario.papel)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
