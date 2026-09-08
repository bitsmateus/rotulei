import { beforeEach, afterEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

it('recuperacoes simultaneas compartilham a rotacao (inclusive StrictMode)', async () => {
  localStorage.setItem('rotulei:refresh', 'anterior');
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/refresh')) {
      await new Promise(r => setTimeout(r, 10));
      return Response.json({ accessToken: 'access', refreshToken: 'novo' });
    }
    return Response.json({ id: 'usuario', papel: 'admin' });
  });
  vi.stubGlobal('fetch', fetchMock);
  const { recuperarSessao } = await import('./api');
  const usuarios = await Promise.all([recuperarSessao(), recuperarSessao()]);
  expect(usuarios.every(u => u?.id === 'usuario')).toBe(true);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1);
  expect(localStorage.getItem('rotulei:refresh')).toBe('novo');
});
