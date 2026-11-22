import { effectScope, nextTick, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, useThemeChoice, useThemeToggle } from '../useThemeToggle'
import indexHtml from '../../../index.html?raw'

// jsdom has neither matchMedia nor the View Transitions API; each test adds what it needs.
const stubMatchMedia = (matching: string[]) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matching.includes(query),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {}
    }))
  )

const stubViewTransition = (ready: Promise<void>) => {
  const animate = vi.fn()
  Object.defineProperty(document.documentElement, 'animate', {
    value: animate,
    configurable: true
  })
  const startViewTransition = vi.fn((update: () => Promise<void>) => {
    void update()
    return { ready, finished: Promise.resolve(), updateCallbackDone: Promise.resolve() }
  })
  Object.assign(document, { startViewTransition })
  return { animate, startViewTransition }
}

const clickOnButton = () => {
  const button = document.createElement('button')
  button.getBoundingClientRect = () => ({ left: 100, top: 20, width: 32, height: 32 }) as DOMRect
  return { currentTarget: button } as unknown as MouseEvent
}

const scopeRun = <T>(use: () => T): T => {
  scope = effectScope()
  return scope.run(use)!
}
const setUp = () => scopeRun(() => useThemeToggle())

let scope: EffectScope
let tokens: HTMLStyleElement
let themeColor: HTMLMetaElement

describe('useThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    tokens = document.createElement('style')
    tokens.textContent = `
      :root { --background: #f7f6f3; --ease-out-soft: cubic-bezier(0.3,0,0,1); }
      .dark { --background: #0e0e0f; }`
    themeColor = document.createElement('meta')
    themeColor.name = 'theme-color'
    document.head.append(tokens, themeColor)
  })

  afterEach(() => {
    scope.stop()
    tokens.remove()
    themeColor.remove()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'startViewTransition')
    Reflect.deleteProperty(document.documentElement, 'animate')
  })

  it('should switch to dark at once and remember the choice when the browser has no View Transitions', async () => {
    const { isDark, toggleTheme } = setUp()

    await toggleTheme(clickOnButton())

    expect(isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('vueuse-color-scheme')).toBe('dark')
  })

  it('should reveal the new theme as a circle growing from the centre of the button', async () => {
    const { animate, startViewTransition } = stubViewTransition(Promise.resolve())
    const { toggleTheme } = setUp()

    await toggleTheme(clickOnButton())

    // Button centre (116, 36) in jsdom's 1024 x 768 window; the farthest corner is (1024, 768).
    const radius = Math.hypot(1024 - 116, 768 - 36)
    expect(startViewTransition).toHaveBeenCalledTimes(1)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(animate).toHaveBeenCalledWith(
      { clipPath: ['circle(0px at 116px 36px)', `circle(${radius}px at 116px 36px)`] },
      {
        duration: 450,
        easing: 'cubic-bezier(0.3,0,0,1)',
        pseudoElement: '::view-transition-new(root)'
      }
    )
  })

  it('should keep the new theme without an error when the transition is skipped', async () => {
    const { animate } = stubViewTransition(
      Promise.reject(new DOMException('Skipped by a newer transition', 'AbortError'))
    )
    const { isDark, toggleTheme } = setUp()

    await expect(toggleTheme(clickOnButton())).resolves.toBeUndefined()

    expect(isDark.value).toBe(true)
    expect(animate).not.toHaveBeenCalled()
  })

  it('should switch without a transition when the user prefers reduced motion', async () => {
    stubMatchMedia(['(prefers-reduced-motion: reduce)'])
    const startViewTransition = vi.fn()
    Object.assign(document, { startViewTransition })
    const { isDark, toggleTheme } = setUp()

    await toggleTheme(clickOnButton())

    expect(startViewTransition).not.toHaveBeenCalled()
    expect(isDark.value).toBe(true)
  })

  it('should follow the system until the user picks a theme', () => {
    stubMatchMedia(['(prefers-color-scheme: dark)'])

    const { isDark } = setUp()

    expect(isDark.value).toBe(true)
    expect(localStorage.getItem('vueuse-color-scheme')).toBe('auto')
  })

  it('should give the window chrome the background of the active theme', async () => {
    const { toggleTheme } = setUp()
    await nextTick()
    expect(themeColor.content).toBe('#f7f6f3')

    await toggleTheme(clickOnButton())
    await nextTick()

    expect(themeColor.content).toBe('#0e0e0f')
  })

  it('should share its storage key with the pre-paint script in index.html', () => {
    expect(THEME_STORAGE_KEY).toBe('vueuse-color-scheme')
    expect(indexHtml).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`)
  })

  it('should store a theme picked in the settings where the header button reads it', async () => {
    const { choice, choose } = scopeRun(() => useThemeChoice())

    await choose(clickOnButton(), 'dark')
    await nextTick()

    expect(choice.value).toBe('dark')
    expect(localStorage.getItem('vueuse-color-scheme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await choose(clickOnButton(), 'auto')
    await nextTick()

    expect(localStorage.getItem('vueuse-color-scheme')).toBe('auto')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
