import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type { PendingImage } from '@/utils/content'
import {
  parseSavedImageNames,
  savedImageNameKeyOf,
  tabImageNameKeyOf,
  withSavedImageNames,
  type ImageNameScope,
  type SavedImageNameBook
} from '@/utils/imageNames'

const SAVED_STORAGE_KEY = 'bull.images.names'

/**
 * File names of the images sent from this app, so the history shows them instead of "Image 2".
 * The transcript keeps only the pixels, re-encoded, so a message is found again by its text and
 * image count. Saved per session across restarts; a tab still waiting for its first session keeps
 * them in memory until the chat store remembers them again under that session.
 */
export const useImageNameStore = defineStore('imageNames', () => {
  const saved = useStorage<SavedImageNameBook>(SAVED_STORAGE_KEY, {}, undefined, {
    serializer: { read: parseSavedImageNames, write: (book) => JSON.stringify(book) }
  })
  const unsaved = ref<Record<string, string[]>>({})

  const remember = (scope: ImageNameScope, text: string, images: readonly PendingImage[]) => {
    if (!images.length) return
    const names = images.map((image) => image.name)
    const tabKey = tabImageNameKeyOf(scope.tabId, [text], images.length)
    if (!scope.sessionId) {
      unsaved.value[tabKey] = names
      return
    }
    delete unsaved.value[tabKey]
    const key = savedImageNameKeyOf(scope.machine, scope.sessionId, [text], images.length)
    // The whole book is replaced: a send with images is rare, and the cap needs all entries anyway.
    saved.value = withSavedImageNames(saved.value, key, names, Date.now())
  }

  /** The names of a message's images, by position; empty when it was not sent from here. */
  const namesOf = (
    scope: ImageNameScope,
    texts: readonly string[],
    imageCount: number
  ): readonly string[] =>
    (scope.sessionId
      ? saved.value[savedImageNameKeyOf(scope.machine, scope.sessionId, texts, imageCount)]?.names
      : unsaved.value[tabImageNameKeyOf(scope.tabId, texts, imageCount)]) ?? []

  return { saved, unsaved, remember, namesOf }
})
