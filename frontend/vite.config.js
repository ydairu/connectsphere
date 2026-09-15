import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directoryName = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(directoryName, '..'),
  server: {
    port: 5173,
    // shared/ (permissions, statuses) sits beside frontend/, outside Vite's default allow list.
    // Vite's server.fs.deny (.env, .env.*, *.{crt,pem}, .git) still applies on top of this.
    fs: { allow: [path.resolve(directoryName, '..')] },
  },
})

