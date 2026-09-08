import { useSessao } from '../auth/AuthProvider';
import { EditorCartaz } from '../features/cartaz/EditorCartaz';
import { BloqueioAssinatura } from '../features/assinatura/BloqueioAssinatura';

const NOME_DO_PAPEL: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Administrador',
  operador: 'Operador',
};

export function Estudio() {
  const { usuario, sair } = useSessao();

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
        <EditorCartaz key={`${usuario.tenantId}:${usuario.id}`} escopoFila={`${usuario.tenantId}:${usuario.id}`} />
      ) : null}
    </>
  );
}
