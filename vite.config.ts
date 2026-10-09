import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // one branding source: VITE_APP_NAME / VITE_APP_TAGLINE also fill index.html
  const brand = {
    '%APP_NAME%': env.VITE_APP_NAME || 'BracketForge',
    '%APP_TAGLINE%': env.VITE_APP_TAGLINE || 'Run tournaments. Build your arena.',
  };
  return {
  plugins: [
    react(),
    {
      name: 'brand-html',
      transformIndexHtml: (html: string) => Object.entries(brand).reduce((h, [k, v]) => h.split(k).join(v), html),
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  };
});
