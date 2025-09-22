import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration. We register the React plugin so that JSX and TSX
 * files are compiled correctly. Vite automatically reads the `.env` file
 * prefixed with VITE_ and exposes those variables to the client.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    historyApiFallback: true,
  },
  preview: {
    port: 3000,
    open: true,
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