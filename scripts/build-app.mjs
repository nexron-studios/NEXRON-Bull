// `tauri build` with the updater signing key. With a public key in tauri.conf.json, Tauri signs
// every installer and refuses to build without the private key. It comes from the environment as
// it is (CI), or from the key file of this machine.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const KEY_ENV = 'TAURI_SIGNING_PRIVATE_KEY'
const PASSWORD_ENV = 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD'
const KEY_PATH_ENV = 'BULL_UPDATER_KEY_PATH'
const DEFAULT_KEY_PATH = join(homedir(), '.tauri', 'bull-updater.key')

const signingEnvOf = (env) => {
  if (env[KEY_ENV]) return env
  const keyPath = env[KEY_PATH_ENV] || DEFAULT_KEY_PATH
  if (!existsSync(keyPath)) {
    console.error(
      `No updater signing key: set ${KEY_ENV}, or put the key at ${keyPath} (${KEY_PATH_ENV} picks another file).`
    )
    process.exit(1)
  }
  // Bull's key has no password; without the variable Tauri would ask for one.
  return {
    ...env,
    [KEY_ENV]: readFileSync(keyPath, 'utf8'),
    [PASSWORD_ENV]: env[PASSWORD_ENV] ?? ''
  }
}

const buildApp = () => {
  // `npx` is a .cmd on Windows, which only a shell runs.
  const { status } = spawnSync('npx tauri build', {
    env: signingEnvOf(process.env),
    shell: true,
    stdio: 'inherit'
  })
  process.exit(status ?? 1)
}

buildApp()
