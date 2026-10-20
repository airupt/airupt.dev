import { defineConfig } from 'vite'

export default defineConfig({
  server: { host: true },
  build: {
    target: 'es2022',
    // Rapier ships its WASM inlined, which makes one large chunk by design
    chunkSizeWarningLimit: 3000,
  },
})
