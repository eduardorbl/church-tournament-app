import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    // Configuração mais simples e efetiva
    historyApiFallback: true,
    // Configuração adicional para garantir que funcione
    middlewareMode: false,
  },
  preview: {
    port: 3000,
    open: true,
    historyApiFallback: true,
  },
  build: {
    outDir: 'dist',
    // Garante que os assets sejam servidos corretamente
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  },
  // Configuração base para garantir roteamento correto
  base: '/',
});