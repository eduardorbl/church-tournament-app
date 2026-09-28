import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SPA: o dev server do Vite já faz fallback para index.html por padrão.
// Em produção, o fallback fica no vercel.json (rewrites).
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, open: true },
  preview: { port: 3000, open: true },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  base: '/',
});
