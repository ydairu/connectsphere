import app from './app.js'
import { env } from './config/env.js'

app.listen(env.port, (error) => {
  if (error) {
    console.error(error.code === 'EADDRINUSE'
      ? `Cannot start ConnectSphere API: port ${env.port} is already in use. Stop the existing server or choose another PORT.`
      : `Cannot start ConnectSphere API: ${error.message}`)
    process.exitCode = 1
    return
  }
  console.log(`ConnectSphere API listening on port ${env.port}`)
})

