import { watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { handleError } from '@/lib/error'
import { applyFavicon, applySchemeSheet, applyTaskbarIcon } from '@/lib/colorSchemeDom'
import { COLOR_SCHEME_SWATCHES, DEFAULT_COLOR_SCHEME_PRESET } from '@/theme/colorSchemes'
import type { ColorSchemePreset } from '@/theme/colorSchemes'
import {
  COLOR_SCHEME_CSS_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  colorSchemeCssOf,
  colorSchemePresetOf
} from '@/utils/colorScheme'

const SERIALIZER = {
  read: (raw: string): ColorSchemePreset => {
    try {
      return colorSchemePresetOf(JSON.parse(raw))
    } catch {
      // Hand-edited or truncated storage: the default, as the boundary promises.
      return DEFAULT_COLOR_SCHEME_PRESET
    }
  },
  write: (preset: ColorSchemePreset) => JSON.stringify(preset)
}

/** The picked colour scheme; every caller shares the stored value (settings page, app root). */
export const useColorScheme = () =>
  useStorage<ColorSchemePreset>(
    COLOR_SCHEME_STORAGE_KEY,
    DEFAULT_COLOR_SCHEME_PRESET,
    localStorage,
    {
      serializer: SERIALIZER,
      writeDefaults: false
    }
  )

const storeSheet = (css: string) => {
  // index.html puts this sheet up before first paint, so a picked accent never flashes blue.
  if (css) localStorage.setItem(COLOR_SCHEME_CSS_STORAGE_KEY, css)
  else localStorage.removeItem(COLOR_SCHEME_CSS_STORAGE_KEY)
}

const applyIcons = (preset: ColorSchemePreset) => {
  const { accent } = COLOR_SCHEME_SWATCHES[preset]
  applyFavicon(accent).catch(handleError)
  applyTaskbarIcon(accent).catch(handleError)
}

/** Applies the scheme to the page, favicon and taskbar; called once at the app root. */
export const useColorSchemeApply = () => {
  const preset = useColorScheme()

  watch(
    preset,
    (next) => {
      const css = colorSchemeCssOf(next)
      applySchemeSheet(css)
      storeSheet(css)
    },
    { immediate: true }
  )

  // Not immediate: at start favicon.svg and the bundled icons already show Night Desk, and a
  // stored scheme gets its icons right below.
  watch(preset, applyIcons)
  if (preset.value !== DEFAULT_COLOR_SCHEME_PRESET) applyIcons(preset.value)
}
