import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// O app de celular reaproveita traduções, predefinições e tipos do app de PC (../src/shared)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  // APP_VERSION=0.9.0 npm run dev: finge ser uma versão velha, para ver o aviso de versão nova
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || pkg.version) },
  server: { port: 5199, fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true }
})
