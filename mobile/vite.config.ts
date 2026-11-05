import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// O app de celular reaproveita traduções, predefinições e tipos do app de PC (../src/shared)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5199, fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true }
})
