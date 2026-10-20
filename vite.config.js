import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  server: { host: true },
  // Rapier ships its physics engine as a .wasm module imported from JS
  plugins: [wasm()],
  build: {
    target: 'es2022',
  },
})
