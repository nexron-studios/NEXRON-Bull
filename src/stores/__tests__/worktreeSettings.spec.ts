import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorktreeSettingsStore } from '../worktreeSettings'

describe('useWorktreeSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('should want a worktree until it is switched off for that folder on that machine', () => {
    const settings = useWorktreeSettingsStore()

    settings.setWanted(null, 'C:\\dev\\projects\\app', false)

    expect(settings.isWanted(null, 'C:\\dev\\projects\\app')).toBe(false)
    expect(settings.isWanted('server', 'C:\\dev\\projects\\app')).toBe(true)
  })

  it('should keep a root per machine and leave agentd its default when it is emptied', () => {
    const settings = useWorktreeSettingsStore()

    settings.setRoot('server', '  /srv/worktrees ')
    settings.setRoot(null, 'D:\\wt')
    settings.setRoot(null, '   ')

    expect(settings.rootOrDefault('server')).toBe('/srv/worktrees')
    expect(settings.rootOrDefault(null)).toBeNull()
    expect(settings.hasOwnRoot).toBe(true)
  })
})
