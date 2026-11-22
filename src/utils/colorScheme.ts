import { mixHex, shiftUntilContrast } from '@/utils/color'
import {
  COLOR_SCHEME_SWATCHES,
  DEFAULT_COLOR_SCHEME_PRESET,
  THEME_BACKGROUND,
  colorSchemePresetList,
  type ColorSchemePreset
} from '@/theme/colorSchemes'

/** Where the picked scheme is stored. */
export const COLOR_SCHEME_STORAGE_KEY = 'bull-color-scheme'
/** The resolved override sheet, read by index.html before first paint so no blue flashes. */
export const COLOR_SCHEME_CSS_STORAGE_KEY = 'bull-color-scheme-css'
/** The `<style>` element that carries the override sheet. */
export const COLOR_SCHEME_STYLE_ID = 'bull-color-scheme'

// public/favicon.svg has exactly one fill: the bull (CLAUDE.md, "Brand").
const BULL_FILL_PATTERN = /fill="#[0-9a-f]{6}"/i

/** The bull of favicon.svg in `accent`, as a data URL for the favicon and the window icon. */
export const bullIconUrlOf = (svg: string, accent: string): string =>
  `data:image/svg+xml,${encodeURIComponent(svg.replace(BULL_FILL_PATTERN, `fill="${accent}"`))}`

export const themeModeList = ['light', 'dark'] as const
export type ThemeMode = (typeof themeModeList)[number]

/** The stored choice, read at the storage boundary; anything unreadable is the default. */
export const colorSchemePresetOf = (value: unknown): ColorSchemePreset => {
  // The first colour schemes stored `{ kind: 'preset', preset }`; a stored own colour is dropped.
  const preset =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>).preset : value
  return colorSchemePresetList.includes(preset as ColorSchemePreset)
    ? (preset as ColorSchemePreset)
    : DEFAULT_COLOR_SCHEME_PRESET
}

const WHITE = '#ffffff'
const BLACK = '#000000'
// WCAG AA for text; tokens.css holds the same bar for the hand-tuned Night Desk.
const TEXT_CONTRAST = 4.5
const HOVER_DEEPER = 0.08
const LINK_HOVER_LIGHT = 0.15
const LINK_HOVER_DARK = 0.3

/**
 * The brand tokens of tokens.css for one accent in one mode. Same jobs as the Night Desk
 * values: `brand-strong` carries white text, `link` is text on the page background.
 */
export const brandTokensOf = (accent: string, mode: ThemeMode): Record<string, string> => {
  const background = THEME_BACKGROUND[mode]
  const strong = shiftUntilContrast(accent, BLACK, WHITE, TEXT_CONTRAST)
  const link =
    mode === 'light'
      ? shiftUntilContrast(accent, BLACK, background, TEXT_CONTRAST)
      : shiftUntilContrast(accent, WHITE, background, TEXT_CONTRAST)
  return {
    brand: accent,
    'brand-foreground': WHITE,
    'brand-strong': strong,
    'brand-strong-hover': mixHex(strong, BLACK, HOVER_DEEPER),
    link,
    'link-hover':
      mode === 'light'
        ? mixHex(link, BLACK, LINK_HOVER_LIGHT)
        : mixHex(link, WHITE, LINK_HOVER_DARK)
  }
}

const blockOf = (selector: string, tokens: Record<string, string>): string =>
  `${selector}{${Object.entries(tokens)
    .map(([name, value]) => `--${name}:${value};`)
    .join('')}}`

/**
 * The sheet that overrides tokens.css for a preset; empty for Night Desk, whose values are the
 * hand-tuned ones. `html:not(.dark)` and `html.dark` outrank `:root` and `.dark` of tokens.css.
 */
export const colorSchemeCssOf = (preset: ColorSchemePreset): string => {
  if (preset === DEFAULT_COLOR_SCHEME_PRESET) return ''
  const { accent } = COLOR_SCHEME_SWATCHES[preset]
  return (
    blockOf('html:not(.dark)', brandTokensOf(accent, 'light')) +
    blockOf('html.dark', brandTokensOf(accent, 'dark'))
  )
}
