/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Fixo de propósito: é esta porta que entra no ALLOWED_ORIGINS da API.
    // Se o Vite escorregasse para a 5174, o CORS recusaria sem explicação.
    strictPort: true,
  },
  build: {
    // Erro de leitura custa caro num sistema de prescrição: manter o sourcemap
    // é o que permite ler um stack de produção sem adivinhação.
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/teste/preparo.ts'],
    css: false,
    // O front valida a configuração ao carregar, então o teste precisa de uma
    // URL válida. Aqui, e não num .env de teste, para ficar à vista.
    env: {
      VITE_API_URL: 'http://api.teste',
    },
  },
});
