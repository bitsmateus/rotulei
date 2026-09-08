import { expect, it, vi } from 'vitest';
import { AsaasWebhookService } from './asaas-webhook.service.js';

it('webhook sem autenticacao nao consulta pagamentos nem altera banco', async () => {
  const cliente = { tokenDoWebhookConfere: () => false, consultarPagamento: vi.fn() };
  const db = { comoSistema: vi.fn() };
  const servico = new AsaasWebhookService(db as any, { obterCliente: async () => cliente } as any);
  expect(await servico.processar({}, { payment: { id: 'pay_teste' } })).toEqual({ ok: true });
  expect(cliente.consultarPagamento).not.toHaveBeenCalled();
  expect(db.comoSistema).not.toHaveBeenCalled();
});

it.each([{}, null, 123, '../../customers', 'pay_x?limit=1'])('recusa identificador de pagamento invalido %j', async id => {
  const cliente = { tokenDoWebhookConfere: () => true, consultarPagamento: vi.fn() };
  const servico = new AsaasWebhookService({} as any, { obterCliente: async () => cliente } as any);
  await servico.processar({}, { payment: { id } });
  expect(cliente.consultarPagamento).not.toHaveBeenCalled();
});
