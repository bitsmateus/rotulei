import { expect, test } from '@playwright/test';
import { cnpjValido, cpfValido, telefoneValido } from '../../api/test/documentos-teste';
import { Client } from 'pg';

test('cadastro valida documentos e abre o estudio com a nova conta', async ({ page }, info) => {
  await page.goto('/cadastro');
  await expect(page.getByRole('button', { name: 'Começar teste grátis' })).toBeEnabled();
  await page.getByRole('button', { name: 'Começar teste grátis' }).click();
  await expect(page.getByText('CNPJ inválido.', { exact: true })).toBeVisible();
  const semente = info.project.name === 'desktop' ? 8101 : 8102;
  await page.getByLabel('Nome do mercado').fill(`Mercado Browser ${semente}`);
  await page.getByLabel('CNPJ', { exact: true }).fill(cnpjValido(semente));
  await page.getByLabel('Seu nome', { exact: true }).fill('Pessoa Teste');
  await page.getByLabel('Seu CPF').fill(cpfValido(semente));
  await page.getByLabel('Seu telefone (com DDD)').fill(telefoneValido(semente));
  await page.getByLabel('E-mail').fill(`browser${semente}@example.com`);
  await page.getByLabel('Senha', { exact: true }).fill('senha-browser-teste-123');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Começar teste grátis' }).click();
  await expect(page.getByRole('heading', { name: 'Novo cartaz' })).toBeVisible();
});

test('login, editor, fila, impressao, reload e troca de conta', async ({ page }, info) => {
  const erros: string[] = [];
  page.on('pageerror', erro => erros.push(erro.message));
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('E-mail').fill('admin@mercadonunes.com.br');
  await page.getByLabel('Senha').fill('senha-incorreta');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Senha').fill('rotulei-dev-2026');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo cartaz' })).toBeVisible();
  await page.getByLabel('Titulo', { exact: true }).fill('ARROZ TESTE');
  await page.getByLabel('Preco', { exact: true }).fill('12,99');
  await page.getByRole('button', { name: '+ Adicionar a fila' }).click();
  await expect(page.getByText('Fila (1)')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/estudio-${info.project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByText('Fila (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(page.getByLabel('Titulo', { exact: true })).toHaveValue('ARROZ TESTE');
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.imprimiu = 'sim'; window.dispatchEvent(new Event('afterprint')); }; });
  await page.getByRole('button', { name: 'Imprimir fila' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-imprimiu', 'sim');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('E-mail').fill('admin@mercadovizinho.com.br');
  await page.getByLabel('Senha').fill('rotulei-dev-2026');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo cartaz' })).toBeVisible();
  await expect(page.getByText('Fila (1)')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('bloqueio permite regularizar ao admin e orienta o operador', async ({ page, request }) => {
  const login = await request.post('/api/auth/login', { data: { email: 'admin@mercadonunes.com.br', senha: 'rotulei-dev-2026' } });
  const tokens = await login.json();
  const eu = await request.get('/api/auth/eu', { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
  const { tenantId } = await eu.json();
  const banco = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await banco.connect();
  async function status(valor: string) {
    await banco.query('begin');
    await banco.query("select set_config('app.papel', 'sistema', true)");
    await banco.query('update tenants set status = $1 where id = $2', [valor, tenantId]);
    await banco.query('commit');
  }
  try {
    await status('inadimplente');
    for (const papel of ['admin', 'operador']) {
      await page.goto('/entrar');
      await page.getByLabel('E-mail').fill(`${papel}@mercadonunes.com.br`);
      await page.getByLabel('Senha').fill('rotulei-dev-2026');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Acesso pausado' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Novo cartaz' })).toHaveCount(0);
      if (papel === 'admin') {
        await page.getByRole('button', { name: 'Regularizar pagamento' }).click();
        // Banco isolado nao possui chave do gateway: erro real, sem cobrar.
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Regularizar pagamento' })).toBeEnabled();
      } else {
        await expect(page.getByRole('button', { name: 'Regularizar pagamento' })).toHaveCount(0);
      }
      await page.getByRole('button', { name: 'Sair', exact: true }).click();
      await expect(page).toHaveURL(/\/entrar$/);
    }
  } finally {
    await status('ativo');
    await banco.end();
  }
});

test('login limita tentativas mesmo com X-Forwarded-For forjado', async ({ request }, info) => {
  test.skip(info.project.name !== 'mobile', 'Executar uma vez apos os fluxos de interface.');
  const status: number[] = [];
  for (let i = 0; i < 21; i++) {
    const resposta = await request.post('/api/auth/login', {
      headers: { 'X-Forwarded-For': `198.51.100.${i + 1}` },
      data: { email: 'inexistente@example.com', senha: 'senha-incorreta' },
    });
    status.push(resposta.status());
  }
  expect(status).toContain(429);
  expect(status.every(s => s === 401 || s === 429)).toBe(true);
});
