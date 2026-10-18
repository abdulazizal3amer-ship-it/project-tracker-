import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' lets the build run from any GitHub Pages sub-path
// (https://<user>.github.io/<repo>/). Routing uses the URL hash.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          dnd: ['@hello-pangea/dnd'],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.{js,jsx}'],
    // Business rules live in logic.js (plus the SQL tests in tests/sql for RLS).
    coverage: { include: ['src/lib/logic.js'], reporter: ['text', 'html'], thresholds: { lines: 60 } },
  },
});
