// Regenerates every app icon from public/favicon.svg, the one source of the bull:
// the Tauri bundle icons in src-tauri/icons and the PWA icons in public/icons.
// App icons put the bull on a dark rounded tile, like the Agent Dashboard; the favicon and the
// header mark stay the bare bull. Windows only for now: the tile is not inset for macOS.
import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const SOURCE = 'public/favicon.svg'
const TAURI_ICONS = 'src-tauri/icons'
const PWA_ICONS = 'public/icons'
const CANVAS = 1024

// Colours mirror the dark Night Desk tokens in src/styles/tokens.css.
const CARD = '#19191a' // --card
const LINE = '#2c2c2d' // --border
const TILE = { inset: 24, radius: 228, strokeWidth: 10 }
// The source has an optical-centring margin, so 0.82 fills about 73 % of the canvas: large
// enough that the bull reads in the taskbar and eye and cheek survive at 16 to 32 px.
const TILE_BULL_SCALE = 0.82
// Maskable and Apple icons get no transparent corners: the launcher crops them itself.
// 0.64 keeps the horn tip inside the maskable safe circle (the glyph fills ~89 % of its box).
const FULL_BLEED_BULL_SCALE = 0.64
const APPLE_TOUCH_SIZE = 180

const tauriIcon = (input, output) =>
  execFileSync('npx', ['tauri', 'icon', input, '-o', output], { stdio: 'ignore', shell: true })

/** The bull's viewBox and inner markup; fails loudly instead of producing a broken icon. */
const readBull = (source) => {
  const root = source.match(/<svg\b[^>]*>/)
  const viewBox = root?.[0].match(/viewBox=["']([^"']+)["']/)?.[1]
  if (!root || !viewBox) throw new Error(`${SOURCE}: no <svg> root with a viewBox`)
  const inner = source.slice(source.indexOf(root[0]) + root[0].length, source.lastIndexOf('</svg>'))
  return { viewBox, inner }
}

const nestedBull = ({ viewBox, inner }, scale) => {
  const size = CANVAS * scale
  const offset = (CANVAS - size) / 2
  return `<svg x="${offset}" y="${offset}" width="${size}" height="${size}" viewBox="${viewBox}">${inner}</svg>`
}

const tileSvg = (bull) => {
  const side = CANVAS - 2 * TILE.inset
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}"><rect x="${TILE.inset}" y="${TILE.inset}" width="${side}" height="${side}" rx="${TILE.radius}" fill="${CARD}" stroke="${LINE}" stroke-width="${TILE.strokeWidth}"/>${nestedBull(bull, TILE_BULL_SCALE)}</svg>`
}

const fullBleedSvg = (bull) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}"><rect width="${CANVAS}" height="${CANVAS}" fill="${CARD}"/>${nestedBull(bull, FULL_BLEED_BULL_SCALE)}</svg>`

const work = mkdtempSync(join(tmpdir(), 'bull-icons-'))
try {
  const bull = readBull(readFileSync(SOURCE, 'utf8'))

  const tile = join(work, 'tile.svg')
  writeFileSync(tile, tileSvg(bull))
  tauriIcon(tile, join(work, 'tile'))
  cpSync(join(work, 'tile'), TAURI_ICONS, {
    recursive: true,
    filter: (path) => !['android', 'ios'].includes(basename(path))
  })
  copyFileSync(join(work, 'tile', 'icon.png'), join(PWA_ICONS, 'icon-512.png'))
  copyFileSync(
    join(work, 'tile', 'android', 'mipmap-xxxhdpi', 'ic_launcher.png'),
    join(PWA_ICONS, 'icon-192.png')
  )

  const fullBleed = join(work, 'full-bleed.svg')
  writeFileSync(fullBleed, fullBleedSvg(bull))
  tauriIcon(fullBleed, join(work, 'full-bleed'))
  copyFileSync(join(work, 'full-bleed', 'icon.png'), join(PWA_ICONS, 'icon-maskable-512.png'))
  copyFileSync(
    join(work, 'full-bleed', 'ios', `AppIcon-60x60@3x.png`),
    join(PWA_ICONS, 'apple-touch-icon.png')
  )
} finally {
  rmSync(work, { recursive: true, force: true })
}
console.log(
  'icons written to',
  TAURI_ICONS,
  'and',
  PWA_ICONS,
  `(apple touch ${APPLE_TOUCH_SIZE} px)`
)
