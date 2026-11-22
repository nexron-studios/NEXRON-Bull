/**
 * The colour schemes of the settings page (Figma 22f): an accent plus two neighbours, in the
 * spirit of the tweakcn community themes. The accent replaces the brand blue in both themes: the
 * bull, Clawd, the focus ring, meters, links and the primary action. The neighbours only show on
 * the preset card. Night Desk is the hand-tuned default of tokens.css and overrides nothing.
 */
export const colorSchemePresetList = [
  'night-desk',
  'claude',
  'violet',
  'teal',
  'forest',
  'rose'
] as const
export type ColorSchemePreset = (typeof colorSchemePresetList)[number]

export const DEFAULT_COLOR_SCHEME_PRESET: ColorSchemePreset = 'night-desk'

export interface ColorSchemeSwatch {
  accent: string
  side: readonly [string, string]
}

export const COLOR_SCHEME_SWATCHES: Record<ColorSchemePreset, ColorSchemeSwatch> = {
  'night-desk': { accent: '#4d7cff', side: ['#9085e9', '#1fa9bd'] },
  claude: { accent: '#d97757', side: ['#e8a87c', '#b5654a'] },
  violet: { accent: '#9085e9', side: ['#b6aef2', '#6a5fd0'] },
  teal: { accent: '#1fa9bd', side: ['#6fd0dc', '#13808f'] },
  forest: { accent: '#2fa36b', side: ['#7cc9a0', '#1d7a4c'] },
  rose: { accent: '#e0527f', side: ['#ef93b1', '#b03a5f'] }
}

/** The page backgrounds of tokens.css, the surface links are measured against. */
export const THEME_BACKGROUND = { light: '#f7f6f3', dark: '#0e0e0f' } as const
