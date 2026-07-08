import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

export default async function globalSetup() {
  if (process.env.E2E_SKIP_BUILD === '1') {
    return
  }

  execSync('npm run build', {
    cwd: ROOT,
    stdio: 'inherit'
  })
}
