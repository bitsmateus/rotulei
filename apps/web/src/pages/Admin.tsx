import { useEffect, useState } from 'react';
import {
  ErroDaApi,
  alterarStatusTenant,
  editarPlano,
  listarPlanosAdmin,
  listarTenants,
  obterMetricas,
  type MetricasPlataforma,
  type Plano,
  type TenantSuperadmin,
} from '../lib/api';

/**
 * Painel superadmin — ESCOPO.md, secao Superadmin: lista de tenants, MRR,
 * suspender/reativar manualmente, planos editaveis sem deploy.
 *
 * Impersonar tenant e a central de ajuda (videos) ficam para depois — pecas
 * com desenho proprio (auditoria de acesso, upload de midia).
 */

const NOME_STATUS: Record<string, string> = {
  trial: 'Em teste',
  ativo: 'Ativo',
  inadimplente: 'Inadimplente',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
};

const STATUS_DISPONIVEIS = ['trial', 'ativo', 'inadimplente', 'suspenso', 'cancelado'];

// Mudar PARA um destes estados corta o acesso do cliente — vale confirmar.
const STATUS_QUE_PEDEM_CONFIRMACAO = new Set(['suspenso', 'cancelado']);

function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function Admin() {
  const [tenants, setTenants] = useState<TenantSuperadmin[]>([]);
  const [metricas, setMetricas] = useState<MetricasPlataforma | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoTenant, setSalvandoTenant] = useState<string | null>(null);

  async function recarregar() {
    const [t, m, p] = await Promise.all([listarTenants(), obterMetricas(), listarPlanosAdmin()]);
    setTenants(t);
    setMetricas(m);
    setPlanos(p);
  }

  useEffect(() => {
    recarregar()
      .catch(() => setErro('Não foi possível carregar o painel.'))
      .finally(() => setCarregando(false));
  }, []);

  async function mudarStatus(tenant: TenantSuperadmin, novoStatus: string) {
    if (novoStatus === tenant.status) return;

    if (STATUS_QUE_PEDEM_CONFIRMACAO.has(novoStatus)) {
      const confirmou = window.confirm(
        `Mudar "${tenant.nome}" para ${NOME_STATUS[novoStatus]}? O acesso do cliente é cortado imediatamente.`,
      );
      if (!confirmou) return;
    }

    setErro(null);
    setSalvandoTenant(tenant.id);
    try {
      const atualizado = await alterarStatusTenant(tenant.id, novoStatus);
      setTenants((atual) => atual.map((t) => (t.id === tenant.id ? atualizado : t)));
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.message : 'Não foi possível mudar o status.');
    } finally {
      setSalvandoTenant(null);
    }
  }

  async function salvarPreco(plano: Plano, precoReais: string) {
    const centavos = Math.round(Number(precoReais.replace(',', '.')) * 100);
    if (!Number.isFinite(centavos) || centavos < 0) return;

    try {
      const atualizado = await editarPlano(plano.id, { precoMensalCentavos: centavos });
      setPlanos((atual) => atual.map((p) => (p.id === plano.id ? atualizado : p)));
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.message : 'Não foi possível salvar o preço.');
    }
  }

  async function alternarAtivo(plano: Plano) {
    try {
      const atualizado = await editarPlano(plano.id, { ativo: !plano.ativo });
      setPlanos((atual) => atual.map((p) => (p.id === plano.id ? atualizado : p)));
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.message : 'Não foi possível atualizar o plano.');
    }
  }

  if (carregando) return <div style={{ padding: 32 }}>Carregando painel…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Painel superadmin</h1>
      <p style={{ color: 'var(--suave)', marginTop: 0 }}>Tenants, cobrança e planos do Rotulei.</p>

      {erro && (
        <p role="alert" style={{ color: 'var(--acento)', fontSize: 14 }}>
          {erro}
        </p>
      )}

      {metricas && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            margin: '20px 0',
          }}
        >
          {[
            { rotulo: 'MRR total', valor: formatarCentavos(metricas.mrrTotalCentavos) },
            { rotulo: 'Ativos', valor: metricas.tenantsAtivos },
            { rotulo: 'Em teste', valor: metricas.tenantsEmTrial },
            { rotulo: 'Inadimplentes', valor: metricas.tenantsInadimplentes },
            { rotulo: 'Suspensos', valor: metricas.tenantsSuspensos },
            { rotulo: 'Cancelados', valor: metricas.tenantsCancelados },
          ].map((c) => (
            <div
              key={c.rotulo}
              style={{
                background: 'var(--superficie)',
                border: '1px solid var(--borda)',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--suave)', textTransform: 'uppercase' }}>
                {c.rotulo}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{c.valor}</div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Tenants ({tenants.length})</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--borda)' }}>
              <th style={{ padding: 8 }}>Mercado</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Plano</th>
              <th style={{ padding: 8 }}>Lojas</th>
              <th style={{ padding: 8 }}>MRR</th>
              <th style={{ padding: 8 }}>Próx. cobrança</th>
              <th style={{ padding: 8 }}>Cadastro</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--borda)' }}>
                <td style={{ padding: 8 }}>
                  {t.nome}
                  <div style={{ color: 'var(--suave)', fontSize: 11 }}>{t.cnpj}</div>
                </td>
                <td style={{ padding: 8 }}>
                  <select
                    value={t.status}
                    disabled={salvandoTenant === t.id}
                    onChange={(e) => mudarStatus(t, e.target.value)}
                    style={{ fontSize: 13 }}
                  >
                    {STATUS_DISPONIVEIS.map((s) => (
                      <option key={s} value={s}>
                        {NOME_STATUS[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 8 }}>{t.plano.nome}</td>
                <td style={{ padding: 8 }}>{t.qtdLojas}</td>
                <td style={{ padding: 8 }}>{formatarCentavos(t.mrrCentavos)}</td>
                <td style={{ padding: 8 }}>
                  {formatarData(t.proximaCobrancaEm)}
                  {t.proximaCobrancaEstimada && t.proximaCobrancaEm && (
                    <span style={{ color: 'var(--suave)', fontSize: 11 }}> (estimado)</span>
                  )}
                </td>
                <td style={{ padding: 8 }}>{formatarData(t.criadoEm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Planos</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--borda)' }}>
              <th style={{ padding: 8 }}>Plano</th>
              <th style={{ padding: 8 }}>Preço mensal</th>
              <th style={{ padding: 8 }}>Por loja</th>
              <th style={{ padding: 8 }}>Limite de lojas</th>
              <th style={{ padding: 8 }}>Ativo no cadastro</th>
            </tr>
          </thead>
          <tbody>
            {planos.map((p) => (
              <PlanoLinha key={p.id} plano={p} onSalvarPreco={salvarPreco} onAlternarAtivo={alternarAtivo} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanoLinha({
  plano,
  onSalvarPreco,
  onAlternarAtivo,
}: {
  plano: Plano;
  onSalvarPreco: (plano: Plano, precoReais: string) => void;
  onAlternarAtivo: (plano: Plano) => void;
}) {
  const [preco, setPreco] = useState((plano.precoMensalCentavos / 100).toFixed(2));

  return (
    <tr style={{ borderBottom: '1px solid var(--borda)' }}>
      <td style={{ padding: 8 }}>{plano.nome}</td>
      <td style={{ padding: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>R$</span>
          <input
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            style={{ width: 80, fontSize: 13, padding: '4px 6px' }}
          />
          <button type="button" onClick={() => onSalvarPreco(plano, preco)}>
            Salvar
          </button>
        </div>
      </td>
      <td style={{ padding: 8 }}>{plano.precoPorLoja ? 'Sim' : 'Não'}</td>
      <td style={{ padding: 8 }}>{plano.limiteLojas ?? 'Sem limite'}</td>
      <td style={{ padding: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={plano.ativo} onChange={() => onAlternarAtivo(plano)} />
          {plano.ativo ? 'Sim' : 'Não'}
        </label>
      </td>
    </tr>
  );
}
