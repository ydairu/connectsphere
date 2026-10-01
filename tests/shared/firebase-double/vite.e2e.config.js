// Vite config for the E2E frontend: the production frontend config plus aliases that swap the
// Firebase client SDK for the in-memory double's browser modules. Nothing in frontend/ changes.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import frontendConfig from '../../../frontend/vite.config.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

export default mergeConfig(
  frontendConfig,
  defineConfig({
    root: path.join(repoRoot, 'frontend'),
    resolve: {
      alias: [
        { find: /^firebase\/app$/, replacement: path.join(here, 'client/app.js') },
        { find: /^firebase\/auth$/, replacement: path.join(here, 'client/auth.js') },
        { find: /^firebase\/firestore$/, replacement: path.join(here, 'client/firestore.js') },
      ],
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.E2E_WEB_PORT) || 5174,
      strictPort: true,
      fs: { allow: [repoRoot] },
    },
  }),
)
