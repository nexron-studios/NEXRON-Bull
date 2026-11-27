import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useStorage } from '@vueuse/core'
import { isDesktopApp } from '@/lib/platform'

// The keys date from when only the browser adopted tabs; renaming them would reopen closed ones.
const ADOPTED_STORAGE_KEY = 'bull.bridge.adoptedTabs'
const CLOSED_STORAGE_KEY = 'bull.bridge.closedTabs'
/** More than ever run at once; the oldest ids fall out, their tabs long gone. */
const MAX_REMEMBERED = 200

const withId = (ids: string[], id: string): string[] =>
  [...ids.filter((known) => known !== id), id].slice(-MAX_REMEMBERED)

/**
 * A browser keeps the lists across reloads. The app window keeps them for its own run only: a
 * second window shares its localStorage and would take this window's tabs for watched ones, and
 * after a restart it adopts again whatever still runs.
 */
const rememberedIds = (key: string) =>
  isDesktopApp() ? ref<string[]>([]) : useStorage<string[]>(key, [])

/**
 * Which tabs another app or device started (this one only watches them) and which were closed here
 * (never opened again while their Claude still runs).
 */
export const useWatchedTabsStore = defineStore('watchedTabs', () => {
  const adopted = rememberedIds(ADOPTED_STORAGE_KEY)
  const closed = rememberedIds(CLOSED_STORAGE_KEY)

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
