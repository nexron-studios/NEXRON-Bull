// Vite config for the README screenshots: the app's own config plus a stand-in for the Tauri
// shell. The page gets tauri-mock.ts, which hands every `agentd_request` over Vite's websocket to
// a real `agentd stdio` per demo machine, started with a demo home folder and the demo Claude.
// Only `quota` is answered here: it would ask Anthropic with a login the demo does not have.
//
// Started by capture.mjs, which sets BULL_DEMO_ROOT (written by demo-data.mjs) and BULL_DEMO_AGENTD.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { mergeConfig, type Plugin, type ViteDevServer } from 'vite'
import appConfig from '../../vite.config.ts'
import { ACCOUNTS, MACHINES } from './demo-data.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const PORT = Number(process.env.BULL_DEMO_PORT ?? 1490)
const LOCAL_MACHINE = 'local'
const HOUR_MS = 60 * 60 * 1000

const QUOTA_PERCENT: Record<string, Record<string, number>> = {
  personal: { five_hour: 38, seven_day: 61, seven_day_opus: 44 },
  work: { five_hour: 12, seven_day: 27 }
}
const RESETS_IN_MS: Record<string, number> = {
  five_hour: 2 * HOUR_MS + 14 * 60 * 1000,
  seven_day: 3 * 24 * HOUR_MS + 5 * HOUR_MS,
  seven_day_opus: 3 * 24 * HOUR_MS + 5 * HOUR_MS
}

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set; start the screenshots with capture.mjs`)
  return value
}

const machineKey = (machine: string | null) => machine ?? LOCAL_MACHINE

const quotaAnswer = (root: string, machine: string, id: number | null) => {
  const now = Date.now()
  const accounts = Object.entries(MACHINES[machine as keyof typeof MACHINES].profiles).map(
    ([folder, account]) => ({
      profile: path.join(root, machine, folder),
      label: folder === '.claude' ? 'default' : folder.slice('.claude-'.length),
      email: ACCOUNTS[account as keyof typeof ACCOUNTS].email,
      plan: ACCOUNTS[account as keyof typeof ACCOUNTS].plan,
      windows: Object.entries(QUOTA_PERCENT[account]).map(([key, usedPercent]) => ({
        key,
        used_percent: usedPercent,
        resets_at: new Date(now + RESETS_IN_MS[key]).toISOString()
      })),
      fetched_ms: now,
      problem: null,
      source: 'anthropic'
    })
  )
  return { type: 'quota', id, accounts }
}

const demoBridge = (): Plugin => {
  const root = required('BULL_DEMO_ROOT')
  const agentd = required('BULL_DEMO_AGENTD')
  const children = new Map<string, ChildProcessWithoutNullStreams>()

  const childFor = (machine: string, server: ViteDevServer) => {
    const running = children.get(machine)
    if (running) return running
    const home = path.join(root, machine)
    const child = spawn(agentd, ['stdio'], {
      env: {
        ...process.env,
        USERPROFILE: home,
        HOME: home,
        AGENTD_CLAUDE: path.join(HERE, 'demo-claude.cmd')
      }
    })
    readline
      .createInterface({ input: child.stdout })
      .on('line', (line) => server.ws.send('bull-demo:event', { line }))
    child.stderr.pipe(process.stderr)
    // A missing exe or a crash ends the connection like a dropped SSH link: the window hears of it,
    // and the next request starts a new agentd.
    const lose = (reason: string) => {
      if (children.get(machine) !== child) return
      children.delete(machine)
      console.error(`demo agentd for ${machine} ended: ${reason}`)
      server.ws.send('bull-demo:lost', { machine })
    }
    child.on('error', (error) => lose(error.message))
    child.on('exit', (code) => lose(`exit code ${code}`))
    child.stdin.on('error', (error) => lose(error.message))
    children.set(machine, child)
    return child
  }

  return {
    name: 'bull-demo-bridge',
    configureServer: (server) => {
      server.ws.on(
        'bull-demo:request',
        ({ line, machine }: { line: string; machine: string | null }) => {
          const key = machineKey(machine)
          const request = JSON.parse(line)
          if (request.op === 'quota') {
            const answer = quotaAnswer(root, key, request.id ?? null)
            server.ws.send('bull-demo:event', { line: JSON.stringify(answer) })
            return
          }
          childFor(key, server).stdin.write(`${line}\n`)
        }
      )
      server.httpServer?.on('close', () => children.forEach((child) => child.kill()))
    },
    transformIndexHtml: (html) =>
      html.replace(
        '<script type="module" src="/src/main.ts"></script>',
        '<script type="module" src="/scripts/readme-screenshots/tauri-mock.ts"></script>\n    $&'
      )
  }
}

// Vite refuses files outside the workspace; a worktree with linked node_modules has them there.
const nodeModules = fs.realpathSync(path.join(REPO, 'node_modules'))

export default mergeConfig(appConfig, {
  plugins: [demoBridge()],
  server: { port: PORT, strictPort: true, fs: { allow: [REPO, nodeModules] } }
})
