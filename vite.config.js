import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    historyApiFallback: {
      index: '/index.html',
      rewrites: [
        { from: /^\/admin/, to: '/index.html' },
        { from: /^\/futsal/, to: '/index.html' },
        { from: /^\/volei/, to: '/index.html' },
        { from: /^\/fifa/, to: '/index.html' },
        { from: /^\/pebolim/, to: '/index.html' },
        { from: /.*/, to: '/index.html' }
      ]
    }
  },
  preview: {
    port: 3000,
    open: true,
    historyApiFallback: {
      index: '/index.html'
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  }
});