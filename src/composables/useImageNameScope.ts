import { computed, inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import type { ImageNameScope } from '@/utils/imageNames'

const IMAGE_NAME_SCOPE: InjectionKey<ComputedRef<ImageNameScope>> = Symbol('imageNameScope')

const isSameScope = (a: ImageNameScope, b: ImageNameScope) =>
  a.tabId === b.tabId && a.machine === b.machine && a.sessionId === b.sessionId

/**
 * The chat pane tells the images in its history which chat they belong to. Every streamed token
 * replaces the tab object; the scope keeps its identity then, so no gallery looks its names up again.
 */
export const provideImageNameScope = (scopeOf: () => ImageNameScope) =>
  provide(
    IMAGE_NAME_SCOPE,
    computed<ImageNameScope>((previous) => {
      const next = scopeOf()
      return previous && isSameScope(previous, next) ? previous : next
    })
  )

/** `null` outside a chat pane: the images are numbered then. */
export const useImageNameScope = () => inject(IMAGE_NAME_SCOPE, null)
