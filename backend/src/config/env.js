import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url))
dotenv.config({ path: rootEnvPath })

export const env = {
  port: Number(process.env.PORT) || 5000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}
