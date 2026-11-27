import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

// The keys date from when only the browser adopted tabs; renaming them would reopen closed ones.
const ADOPTED_STORAGE_KEY = 'bull.bridge.adoptedTabs'
const CLOSED_STORAGE_KEY = 'bull.bridge.closedTabs'
/** More than ever run at once; the oldest ids fall out, their tabs long gone. */
const MAX_REMEMBERED = 200

const withId = (ids: string[], id: string): string[] =>
  [...ids.filter((known) => known !== id), id].slice(-MAX_REMEMBERED)

/**
 * Which tabs another app or device started (this one only watches them) and which were closed here
 * (never opened again while their Claude still runs). Kept across reloads.
 */
export const useWatchedTabsStore = defineStore('watchedTabs', () => {
  const adopted = useStorage<string[]>(ADOPTED_STORAGE_KEY, [])
  const closed = useStorage<string[]>(CLOSED_STORAGE_KEY, [])

  const markAdopted = (ids: string[]) => {
    adopted.value = ids.reduce(withId, adopted.value)
  }

  const markClosed = (id: string) => {
    closed.value = withId(closed.value, id)
    adopted.value = adopted.value.filter((known) => known !== id)
  }

  const isAdopted = (id: string) => adopted.value.includes(id)
  const isClosed = (id: string) => closed.value.includes(id)

  return { markAdopted, markClosed, isAdopted, isClosed }
})
