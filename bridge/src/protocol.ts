/**
 * What the bridge and the web app say over the socket. Shared by both sides, so it imports
 * nothing from Node.
 */

/** A machine from the bridge's list; `null` is the one the bridge runs on. */
export type Machine = string | null

export const SOCKET_PATH = '/ws'

export const closeReasonList = [
  'unauthorized',
  'bad_message',
  'auth_timeout',
  'auth_unavailable'
] as const
export type CloseReason = (typeof closeReasonList)[number]
/**
 * 4000-4999 is free for applications; the browser hands the code to the app. Only `unauthorized`
 * means the token is wrong: the app forgets it then, and tries again after the others.
 */
export const CLOSE_CODE: Record<CloseReason, number> = {
  unauthorized: 4401,
  bad_message: 4400,
  auth_timeout: 4408,
  auth_unavailable: 4503
}

/** From the device: its token first, then protocol lines for agentd on a machine. */
export type ClientMessage =
  { type: 'auth'; token: string } | { type: 'request'; seq: number; machine: Machine; line: string }

/**
 * From the bridge. Connection ids stay unique across bridge restarts, so the app may remember an
 * ended one by its id.
 */
export type BridgeMessage =
  | { type: 'ready'; machines: string[] }
  | { type: 'sent'; seq: number; connection: number }
  | { type: 'failed'; seq: number; message: string }
  | { type: 'event'; line: string }
  | { type: 'disconnected'; machine: Machine; connection: number }
