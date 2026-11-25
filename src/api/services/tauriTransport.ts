import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AgentdTransport } from '@/api/agentdTransport'

const AGENTD_EVENT = 'agentd'

/** The app window's way to agentd: `src-tauri/src/connections.rs`. */
export const tauriTransport: AgentdTransport = {
  request: (line, machine) => invoke<number>('agentd_request', { line, machine }),

  onLine: (listener) => listen<string>(AGENTD_EVENT, ({ payload }) => listener(payload)),

  // The window reaches its machines whenever it asks; the app attaches once its tabs are restored,
  // which the persisted store does right after it is set up.
  onReady: (listener) => {
    queueMicrotask(() => listener([]))
    return () => undefined
  }
}
