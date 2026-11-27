import { isTauri } from '@tauri-apps/api/core'
import { windowService } from '@/api/services/window.service'
import { COLOR_SCHEME_STYLE_ID, bullIconUrlOf } from '@/utils/colorScheme'

// What a colour scheme changes outside the token sheet: the favicon and the window icon.
// Kept apart from the pure scheme logic in utils.

/** Set on <html> while a scheme other than Night Desk is active. */
export const COLOR_SCHEME_ATTRIBUTE = 'data-color-scheme'

// The tile of scripts/make-icons.mjs (CANVAS, TILE_FILL, TILE_RADIUS, TILE_BULL_SCALE), scaled from its
// 1024 px canvas, so a recoloured taskbar icon looks like the bundled one.
const ICON_CANVAS_PX = 1024
const TASKBAR_ICON_PX = 256
const TILE_FILL = '#0e0e0f'
const TILE_RADIUS = 200
const TILE_BULL_SCALE = 0.82

let sheetVersion = 0
let taskbarIconRun = 0

/** Puts the override sheet on the page; an empty sheet removes it (Night Desk). */
export const applySchemeSheet = (css: string) => {
  const existing = document.getElementById(COLOR_SCHEME_STYLE_ID)
  if (!css) {
    existing?.remove()
    document.documentElement.removeAttribute(COLOR_SCHEME_ATTRIBUTE)
    return
  }
  const style = existing ?? document.head.appendChild(document.createElement('style'))
  style.id = COLOR_SCHEME_STYLE_ID
  style.textContent = css
  // A new value on every change, which the terminal's observer sees, so xterm rereads the tokens.
  sheetVersion += 1
  document.documentElement.setAttribute(COLOR_SCHEME_ATTRIBUTE, String(sheetVersion))
}

// public/favicon.svg stays the one source of the bull (CLAUDE.md, "Brand"); it has one fill.
const FAVICON_URL = '/favicon.svg'
let faviconSource: Promise<string> | null = null

/** The bull of favicon.svg in `accent`, as a data URL. */
const bullUrlOf = async (accent: string): Promise<string> => {
  faviconSource ??= fetch(FAVICON_URL).then((response) => {
    if (!response.ok) throw new Error(`colorScheme.favicon_load_failed ${response.status}`)
    return response.text()
  })
  return bullIconUrlOf(await faviconSource, accent)
}

export const applyFavicon = async (accent: string) => {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link) link.href = await bullUrlOf(accent)
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('colorScheme.taskbar_icon_render_failed'))
    image.src = src
  })

const drawTile = (context: CanvasRenderingContext2D, bull: HTMLImageElement) => {
  context.fillStyle = TILE_FILL
  context.beginPath()
  context.roundRect(0, 0, ICON_CANVAS_PX, ICON_CANVAS_PX, TILE_RADIUS)
  context.fill()
  const size = ICON_CANVAS_PX * TILE_BULL_SCALE
  const offset = (ICON_CANVAS_PX - size) / 2
  context.drawImage(bull, offset, offset, size, size)
}

/** Title bar and taskbar icon: the bull in `accent` on the app tile. Tauri only. */
export const applyTaskbarIcon = async (accent: string) => {
  if (!isTauri()) return
  // Only the newest call may set the icon; an older one that finishes late is dropped.
  const run = ++taskbarIconRun
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TASKBAR_ICON_PX
  const context = canvas.getContext('2d')
  if (!context) return
  context.scale(TASKBAR_ICON_PX / ICON_CANVAS_PX, TASKBAR_ICON_PX / ICON_CANVAS_PX)
  drawTile(context, await loadImage(await bullUrlOf(accent)))
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob || run !== taskbarIconRun) return
  await windowService.setIcon(new Uint8Array(await blob.arrayBuffer()))
}
