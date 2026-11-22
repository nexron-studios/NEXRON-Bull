// The Tauri shell for the README screenshots, loaded before the app by vite.config.ts. agentd
// requests travel over Vite's websocket to the demo agentd processes; the other commands answer
// with what the window would see on a PC with one more machine, `build-server`.

import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import { emit } from '@tauri-apps/api/event'

const DEMO_MACHINE = { name: 'build-server', host: 'build-server' }
/** How the bridge names this PC, which the app calls `null`. */
const LOCAL_MACHINE = 'local'
const CONNECTION_IDS: Record<string, number> = { [LOCAL_MACHINE]: 1, [DEMO_MACHINE.name]: 2 }
const DEMO_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIReadmeDemoKeyOnly demo@example.com'

type Args = Record<string, unknown>

const answers: Record<string, (args: Args) => unknown> = {
  agentd_request: ({ line, machine }) => {
    import.meta.hot!.send('bull-demo:request', { line, machine })
    return CONNECTION_IDS[(machine as string | null) ?? LOCAL_MACHINE]
  },
  list_machines: () => [DEMO_MACHINE],
  machine_suggestions: () => [],
  test_machine: () => ({ reason: 'ok', version: __APP_VERSION__, detail: null, known_host: null }),
  ssh_public_key: () => DEMO_PUBLIC_KEY,
  notification_setting: () => 'enabled',
  terminal_shells: () => [],
  'plugin:notification|is_permission_granted': () => true,
  'plugin:window|is_focused': () => true
}

mockWindows('main')
mockIPC((cmd, args) => answers[cmd]?.((args ?? {}) as Args) ?? null, { shouldMockEvents: true })
;(globalThis as { isTauri?: boolean }).isTauri = true

import.meta.hot!.on('bull-demo:event', ({ line }: { line: string }) => void emit('agentd', line))
import.meta.hot!.on('bull-demo:lost', ({ machine }: { machine: string }) => {
  const lost = {
    type: 'disconnected',
    machine: machine === LOCAL_MACHINE ? null : machine,
    connection: CONNECTION_IDS[machine]
  }
  void emit('agentd', JSON.stringify(lost))
})
