import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  server: { host: true },
  // Rapier ships its physics engine as a .wasm module imported from JS
  plugins: [wasm()],
  build: {
    target: 'es2022',
    // The 3D chunk (three.js and the world) is one ~1 MB file by design; it
    // loads behind the loader, which itself is a separate tiny chunk
    chunkSizeWarningLimit: 1200,
  },
})
