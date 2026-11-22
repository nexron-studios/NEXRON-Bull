// Reads Lucide icon geometry from the installed @lucide/vue package without executing it.
import { readFileSync, existsSync } from 'node:fs'

const ICON_DIR = new URL('../../node_modules/@lucide/vue/dist/esm/icons/', import.meta.url)
export const missing = new Set()

const ALIAS = {
  'shield-alert': 'shield-exclamation-point',
  'message-circle-question': 'message-circle-question-mark',
  history: 'rotate-ccw-clock',
  'triangle-alert': 'triangle-exclamation-point',
  'circle-alert': 'circle-exclamation-point',
  github: 'code-xml',
  figma: 'frame'
}

const load = (name) => {
  name = ALIAS[name] ?? name
  const file = new URL(`${name}.mjs`, ICON_DIR)
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  const literal = text.slice(text.indexOf('const __iconData = ') + 19, text.indexOf('};') + 1)
  return new Function(`return ${literal}`)()
}

const attrs = (o) =>
  Object.entries(o)
    .filter(([k]) => k !== 'key')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

/** Inline Lucide SVG; colour via stroke, size in px. */
export const ic = (name, size = 16, color = 'currentColor', stroke = 2) => {
  const data = load(name)
  if (!data) {
    missing.add(name)
    return `<span style="display:inline-block;width:${size}px;height:${size}px"></span>`
  }
  const body = data.node.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">${body}</svg>`
}
