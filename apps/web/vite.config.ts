import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Em dev o front chama /api e o Vite repassa para o NestJS — assim nao
      // existe CORS nem URL de API diferente entre dev e producao.
      '/api': { target: `http://localhost:${process.env.ROTULEI_TEST_PORT ?? 3333}`, changeOrigin: true },
    },
  },
  test: {
    include: ['src/**/*.spec.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/teste-setup.ts'],
  },
});
