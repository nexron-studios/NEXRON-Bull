import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 256 bits: guessing one over the socket is hopeless, so the bridge needs no lockout. */
const TOKEN_BYTES = 32
/** One device per line: the SHA-256 of its token, then the name it was made for. */
const TOKEN_LINE = /^([0-9a-f]{64}) (\S+)$/
const DEVICE_NAME = /^[\w.-]{1,40}$/

const hashOf = (token: string): Buffer => createHash('sha256').update(token).digest()

export const isDeviceName = (name: string): boolean => DEVICE_NAME.test(name)

/**
 * A new device token. Only its hash is stored, so the file next to agentd's own token does not
 * hand out access when someone reads it; the token itself is shown once.
 */
export const createToken = async (file: string, device: string): Promise<string> => {
  if (!isDeviceName(device))
    throw new Error(`device name "${device}" must be 1-40 of a-z, 0-9, _ . -`)
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, `${hashOf(token).toString('hex')} ${device}\n`, { mode: 0o600 })
  return token
}

/** The stored hashes; a line that is not ours fails loudly instead of being skipped. */
export const loadTokenHashes = async (file: string): Promise<Buffer[]> => {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
  return lines.flatMap((line, index) => {
    if (!line.trim()) return []
    const match = TOKEN_LINE.exec(line.trim())
    if (!match) throw new Error(`${file}, line ${index + 1}: expected "<sha256> <device>"`)
    return [Buffer.from(match[1], 'hex')]
  })
}

export const isKnownToken = (hashes: readonly Buffer[], token: string): boolean => {
  const hash = hashOf(token)
  // Every hash is compared, so the time taken tells nothing about which one came close.
  return hashes.reduce((isFound, known) => timingSafeEqual(known, hash) || isFound, false)
}
