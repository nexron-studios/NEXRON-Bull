import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isTauri } from '@tauri-apps/api/core'
import { registerServiceWorker } from '../pwa'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn() }))

describe('registerServiceWorker', () => {
  const register = vi.fn()

  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(false)
    register.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('should register /sw.js in a plain browser tab', () => {
    registerServiceWorker()

    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('should not register inside the Tauri window', () => {
    vi.mocked(isTauri).mockReturnValue(true)

    registerServiceWorker()

    expect(register).not.toHaveBeenCalled()
  })

  it('should do nothing in a browser without service workers', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker')

    expect(() => registerServiceWorker()).not.toThrow()
    expect(register).not.toHaveBeenCalled()
  })
})
