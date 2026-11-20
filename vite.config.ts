import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * La clave se lee de `.env.local` (gitignored) para que el preview local funcione
 * al instante SIN que el secreto quede en un archivo del repositorio público.
 * En Vercel, con VITE_AI_PROXY=1, el cliente recibe '' y api/ai.mjs inyecta
 * AI_API_KEY en el servidor.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useProxy = env.VITE_AI_PROXY === '1';
  const clientKey = useProxy ? '' : (env.VITE_AI_API_KEY || '');
  const clientTavilyKey = useProxy ? '' : (env.VITE_TAVILY_API_KEY || '');

  return {
    plugins: [react()],
    define: {
      __CLIENT_AI_KEY__: JSON.stringify(clientKey),
      __CLIENT_TAVILY_KEY__: JSON.stringify(clientTavilyKey),
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      hmr: { clientPort: 443, protocol: 'wss' },
    },
    preview: { host: '0.0.0.0', allowedHosts: true },
    build: { target: 'es2022', chunkSizeWarningLimit: 1400 },
  };
});
