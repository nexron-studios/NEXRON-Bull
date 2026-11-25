import type { BridgeMessage, Machine } from '@bridge/protocol'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)

const isMachine = (value: unknown): value is Machine => value === null || typeof value === 'string'

/**
 * The one place a message from the bridge is checked; `null` for one this app cannot read or does
 * not know (a newer bridge may send more), which is then left out.
 */
export const parseBridgeMessage = (data: string): BridgeMessage | null => {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const { type, seq, connection, machine, machines, message, line } = value
  if (type === 'ready' && Array.isArray(machines) && machines.every((m) => typeof m === 'string'))
    return { type, machines }
  if (type === 'sent' && isCount(seq) && isCount(connection)) return { type, seq, connection }
  if (type === 'failed' && isCount(seq) && typeof message === 'string')
    return { type, seq, message }
  if (type === 'event' && typeof line === 'string') return { type, line }
  if (type === 'disconnected' && isMachine(machine) && isCount(connection))
    return { type, machine, connection }
  return null
}
