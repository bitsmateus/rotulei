import { useEffect, useState } from 'react';
import { ErroDaApi, iniciarCheckout, obterStatusAssinatura, type StatusAssinatura } from '../../lib/api';
import type { UsuarioDaSessao } from '../../lib/api';

/**
 * Tela de bloqueio (Opção B — DECISOES.md #18).
 *
 * Só o admin consegue pagar (AssinaturaController exige @Papeis('admin')) —
 * o operador não deveria nem ver um botão que ia dar 403. Ao clicar, a aba
 * inteira é redirecionada para o checkout HOSPEDADO no Asaas: o Rotulei nunca
 * vê número de cartão (decisão #19). Quem confirma o pagamento de volta é o
 * webhook, não esta tela — por isso não há "aguardando confirmação" aqui,
 * só a orientação de voltar depois de pagar.
 */
export function BloqueioAssinatura({ usuario }: { usuario: UsuarioDaSessao }) {
  const ehAdmin = usuario.papel === 'admin';

  const [status, setStatus] = useState<StatusAssinatura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [redirecionando, setRedirecionando] = useState(false);

  useEffect(() => {
    if (!ehAdmin) return;
    obterStatusAssinatura()
      .then(setStatus)
      .catch(() => {
        // Sem status para mostrar, a tela ainda funciona — só fica sem o
        // detalhe de "trial vencido" vs. "pagamento recusado".
      });
  }, [ehAdmin]);

  async function pagar() {
    setErro(null);
    setRedirecionando(true);
    try {
      const { checkoutUrl } = await iniciarCheckout();
      window.location.href = checkoutUrl;
    } catch (falha) {
      setErro(
        falha instanceof ErroDaApi
          ? falha.message
          : 'Não foi possível iniciar o pagamento. Tente novamente em instantes.',
      );
      setRedirecionando(false);
    }
  }

  const mensagemPorStatus: Record<string, string> = {
    trial: 'Seu período de teste terminou.',
    inadimplente: 'Sua última cobrança não foi confirmada.',
  };

  return (
    <main style={{ display: 'grid', placeItems: 'center', padding: 24, minHeight: '60vh' }}>
      <div
        style={{
          maxWidth: 420,
          textAlign: 'center',
          background: 'var(--superficie)',
          border: '1px solid var(--borda)',
          borderRadius: 14,
          padding: 32,
        }}
      >
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Acesso pausado</h1>
        <p style={{ color: 'var(--suave)', marginTop: 0 }}>
          {mensagemPorStatus[status?.statusTenant ?? ''] ??
            'Sua conta está com uma pendência de pagamento.'}
        </p>

        {ehAdmin ? (
          <>
            <p style={{ fontSize: 14 }}>
              Continue de onde parou assim que o pagamento for confirmado — Pix, boleto ou
              cartão, você escolhe na próxima tela.
            </p>

            {erro && (
              <p role="alert" style={{ color: 'var(--acento)', fontSize: 14 }}>
                {erro}
              </p>
            )}

            <button
              type="button"
              onClick={pagar}
              disabled={redirecionando}
              style={{
                width: '100%',
                marginTop: 10,
                background: 'var(--acento)',
                color: '#fff',
                borderColor: 'var(--acento)',
                fontWeight: 600,
              }}
            >
              {redirecionando ? 'Abrindo pagamento…' : 'Regularizar pagamento'}
            </button>
          </>
        ) : (
          <p style={{ fontSize: 14 }}>
            Fale com o administrador do mercado para regularizar o acesso — só ele consegue
            atualizar o pagamento.
          </p>
        )}
      </div>
    </main>
  );
}
