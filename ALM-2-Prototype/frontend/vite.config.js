import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Ports come from the launcher (start-all) which picks the next free port; defaults match the docs.
const API_PORT = process.env.SENTINEL_API_PORT || '48731'
const FE_PORT = Number(process.env.SENTINEL_FE_PORT || 48732)

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\/](react|react-dom|react-router|react-router-dom|@remix-run|scheduler)[\/]/.test(id)) return 'vendor-react'
          if (/node_modules[\/](recharts|recharts-scale|d3-[^\/]+|victory-vendor|internmap|decimal\.js-light|eventemitter3|lodash[^\/]*|react-smooth|react-transition-group|fast-equals|tiny-invariant|clsx)[\/]/.test(id)) return 'vendor-charts'
          return undefined
        },
      },
    },
  },
  server: { port: FE_PORT, strictPort: false, proxy: { '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: true } } },
})
