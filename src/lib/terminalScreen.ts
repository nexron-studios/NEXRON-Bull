import type { IBuffer, IDisposable, Terminal } from '@xterm/xterm'

/** Primary device attributes: a VT level 1 terminal (`CSI ? 61 c`) */
const DEVICE_ATTRIBUTES = '\x1b[?61c'

/**
 * Whether any row shows a character. ConPTY sends mode switches and the window title before the
 * shell prints a thing; those draw nothing and must not end the skeleton.
 */
export const hasScreenText = (buffer: IBuffer): boolean => {
  for (let row = 0; row < buffer.length; row += 1) {
    if (buffer.getLine(row)?.translateToString(true).trim()) return true
  }
  return false
}

/**
 * Answers the primary device attributes (`CSI c`, `CSI 0 c`) itself. ConPTY on current Windows asks
 * at every start and waits about 3 s unless the answer names a VT level (61 and up); xterm answers
 * as a plain VT100 (`?1;2c`), so every shell stayed blank for 3 s (measured on Windows build 26300
 * with cmd and PowerShell 7).
 */
export const answerDeviceAttributes = (term: Terminal, send: (data: string) => void): IDisposable =>
  term.parser.registerCsiHandler({ final: 'c' }, (params) => {
    if (params.length > 1 || params[0]) return false
    send(DEVICE_ATTRIBUTES)
    return true
  })
