import type { Machine } from '@/api/agentdErrors'

/**
 * How protocol lines reach agentd and come back: Tauri's `agentd_request` and window event in the
 * app, the bridge's WebSocket in a browser. Both carry the same lines and connection ids.
 */
export interface AgentdTransport {
  /** Sends one line and resolves with the id of the connection it went out on. */
  request: (line: string, machine: Machine) => Promise<number>
  /** Resolves once the listener is in place, so no line sent afterwards goes unheard. */
  onLine: (listener: (line: string) => void) => Promise<() => void>
  /**
   * Called when the app may attach to its tabs, with the machines to ask besides the ones it has
   * tabs on: none in the app window (once; it started its own tabs), every machine the bridge
   * reaches in a browser (on every sign-in; it learns of tabs only by asking).
   */
  onReady: (listener: (machines: Machine[]) => void) => () => void
}
