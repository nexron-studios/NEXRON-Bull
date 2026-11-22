import { nextTick, watch } from 'vue'
import { useColorMode, useDark } from '@vueuse/core'
import { isSkippedTransition } from '@/utils/viewTransitions'

/** Where the chosen theme is stored. index.html reads the same key before first paint. */
export const THEME_STORAGE_KEY = 'vueuse-color-scheme'

const REVEAL_MS = 450
// Fallback only: the curve is the --ease-out-soft token in tokens.css.
const REVEAL_EASING_FALLBACK = 'cubic-bezier(0.2, 0, 0, 1)'

const readRootToken = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

// The window chrome (title bar on mobile, PWA frame) takes the page background.
export const syncThemeColor = () => {
  const background = readRootToken('--background')
  if (!background) return
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
}

/** The choices of the settings page; `auto` follows the system. */
export const themeChoiceList = ['auto', 'light', 'dark'] as const
export type ThemeChoice = (typeof themeChoiceList)[number]

/**
 * Runs `apply` behind a circle that grows from the centre of the control that asked for it, the
 * house reveal for a theme change. Centre of the control, not the pointer: works for keys too.
 */
const revealFrom = async (event: MouseEvent | KeyboardEvent, apply: () => Promise<void>) => {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || prefersReducedMotion) return apply()

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))

  const transition = document.startViewTransition(apply)
  try {
    await transition.ready
  } catch (error) {
    // The theme has flipped already; only the circle is skipped.
    if (isSkippedTransition(error)) return
    throw error
  }
  document.documentElement.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
    {
      duration: REVEAL_MS,
      easing: readRootToken('--ease-out-soft') || REVEAL_EASING_FALLBACK,
      pseudoElement: '::view-transition-new(root)'
    }
  )
}

export const useThemeToggle = () => {
  const isDark = useDark({ storageKey: THEME_STORAGE_KEY }) // `.dark` on <html>, persisted, follows the system until chosen

  const toggleTheme = (event: MouseEvent | KeyboardEvent) =>
    revealFrom(event, async () => {
      isDark.value = !isDark.value
      await nextTick()
    })

  // flush 'post' runs after useDark has swapped the class, so the token is the new theme's.
  watch(isDark, syncThemeColor, { immediate: true, flush: 'post' })

  return { isDark, toggleTheme }
}

/**
 * System, light or dark as a choice (settings page), on the same stored value as the toggle: the
 * header button and the settings always agree.
 */
export const useThemeChoice = () => {
  const mode = useColorMode({ storageKey: THEME_STORAGE_KEY, modes: { light: '', dark: 'dark' } })

  const choose = (event: MouseEvent | KeyboardEvent, choice: ThemeChoice) => {
    if (mode.store.value === choice) return Promise.resolve()
    return revealFrom(event, async () => {
      mode.value = choice
      await nextTick()
    })
  }

  watch(mode.state, syncThemeColor, { flush: 'post' })

  return { choice: mode.store, choose }
}
