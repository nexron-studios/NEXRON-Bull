import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDraftStore } from '../drafts'

describe('useDraftStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should give a tab the draft it left behind', () => {
    const store = useDraftStore()
    store.draftOf('t1').text = 'half a prompt'

    expect(store.draftOf('t1').text).toBe('half a prompt')
  })

  it('should keep the drafts of two tabs apart', () => {
    const store = useDraftStore()
    store.draftOf('t1').text = 'first'

    expect(store.draftOf('t2')).toEqual({ text: '', images: [], readingCount: 0, pastes: [] })
  })

  it('should start empty again after the draft was discarded', () => {
    const store = useDraftStore()
    store.draftOf('t1').text = 'gone'

    store.discard('t1')

    expect(store.draftOf('t1').text).toBe('')
  })
})
