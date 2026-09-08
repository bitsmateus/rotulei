import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSessao } from '../auth/AuthProvider';
import { EditorCartaz } from '../features/cartaz/EditorCartaz';
import { BloqueioAssinatura } from '../features/assinatura/BloqueioAssinatura';
import { obterMarca } from '../lib/api';

const NOME_DO_PAPEL: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Administrador',
  operador: 'Operador',
};

export function Estudio() {
  const { usuario, sair } = useSessao();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!usuario || usuario.papel === 'superadmin' || usuario.bloqueado) return;
    obterMarca()
      .then((m) => setLogoUrl(m.logoDataUrl))
      .catch(() => {
        // Sem marca configurada (ou plano sem o recurso) nao e erro — o
        // cartaz so nao mostra logo, como se `mostrarLogo` estivesse desligado.
      });
  }, [usuario]);

  // Superadmin nao tem tenant nem cartaz para editar — o lugar dele e o
  // painel, nao o estudio.
  if (usuario?.papel === 'superadmin') return <Navigate to="/admin" replace />;

  return (
    <>
      <header
        className="tela"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 20px',
          borderBottom: '1px solid var(--borda)',
          background: 'var(--superficie)',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontSize: 17 }}>Rotulei</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {usuario?.papel === 'admin' && !usuario.bloqueado && <Link to="/painel">Painel do mercado</Link>}
          <span style={{ color: 'var(--suave)', fontSize: 13 }}>
            {NOME_DO_PAPEL[usuario?.papel ?? ''] ?? usuario?.papel}
          </span>
          <button type="button" onClick={sair}>
            Sair
          </button>
        </div>
      </header>

      {usuario?.bloqueado ? (
        <BloqueioAssinatura usuario={usuario} />
      ) : usuario ? (
        <EditorCartaz
          key={`${usuario.tenantId}:${usuario.id}`}
          escopoFila={`${usuario.tenantId}:${usuario.id}`}
          logoUrl={logoUrl}
        />
      ) : null}
    </>
  );
}
