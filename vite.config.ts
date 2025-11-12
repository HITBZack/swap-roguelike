import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config with React plugin. Phaser runs inside React shell via a container div.
export default defineConfig({
  plugins: [react()],
})
