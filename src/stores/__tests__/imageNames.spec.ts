import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingImage } from '@/utils/content'
import { useImageNameStore } from '../imageNames'

const STORAGE_KEY = 'bull.images.names'

const image = (name: string): PendingImage => ({
  id: name,
  name,
  mediaType: 'image/png',
  data: 'aGk=',
  src: 'data:image/png;base64,aGk=',
  bytes: 2
})

const SESSION = { tabId: 'tab-1', machine: null, sessionId: 'session-a' }

describe('useImageNameStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should find the names of a sent prompt by its echoed text and image count', () => {
    const store = useImageNameStore()
    store.remember(SESSION, 'Fix the header', [image('header.png'), image('logo.png')])

    expect(store.namesOf(SESSION, [' Fix the header '], 2)).toEqual(['header.png', 'logo.png'])
  })

  it('should know nothing about a message sent elsewhere', () => {
    const store = useImageNameStore()
    store.remember(SESSION, 'Fix the header', [image('header.png')])
    const otherChat = { tabId: 'tab-2', machine: null, sessionId: 'session-b' }

    expect(store.namesOf(SESSION, ['Fix the header'], 2)).toEqual([])
    expect(store.namesOf(otherChat, ['Fix the header'], 1)).toEqual([])
  })

  it('should start from an empty book when nothing was saved yet', () => {
    const store = useImageNameStore()

    expect(store.saved).toEqual({})
    expect(store.namesOf(SESSION, ['Fix the header'], 1)).toEqual([])
  })

  it('should find the names again after a restart, in another tab', async () => {
    useImageNameStore().remember(SESSION, 'Fix the header', [image('header.png')])
    await nextTick()

    setActivePinia(createPinia())
    const restarted = useImageNameStore()
    const resumed = { ...SESSION, tabId: 'tab-2' }

    expect(restarted.namesOf(resumed, ['Fix the header'], 1)).toEqual(['header.png'])
  })

  it('should keep a prompt sent before Claude started only for this run, by its tab', async () => {
    const starting = { tabId: 'tab-1', machine: null, sessionId: null }
    const store = useImageNameStore()
    store.remember(starting, 'Fix the header', [image('header.png')])
    await nextTick()

    expect(store.namesOf(starting, ['Fix the header'], 1)).toEqual(['header.png'])
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{}')
  })

  it('should move the names under the session once Claude started the tab', async () => {
    const starting = { tabId: 'tab-1', machine: null, sessionId: null }
    const store = useImageNameStore()
    store.remember(starting, 'Fix the header', [image('header.png')])
    store.remember(SESSION, 'Fix the header', [image('header.png')])
    await nextTick()

    expect(store.unsaved).toEqual({})
    expect(store.namesOf(SESSION, ['Fix the header'], 1)).toEqual(['header.png'])
  })

  it('should save only the names, never the image data', async () => {
    useImageNameStore().remember(SESSION, 'Fix the header', [image('header.png')])
    await nextTick()

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')).toEqual({
      '|session-a|wbpbn9': { names: ['header.png'], at: 1_000 }
    })
  })
})
