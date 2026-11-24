import { computed, ref, watch } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import {
  createSharedComposable,
  tryOnScopeDispose,
  useDebounceFn,
  useEventListener,
  useStorage
} from '@vueuse/core'
import { windowService, type LogicalWindowSize } from '@/api/services/window.service'
import { handleError } from '@/lib/error'
import { uiZoomActionOf } from '@/utils/shortcuts'
import {
  DEFAULT_UI_ZOOM_CHOICE,
  UI_ZOOM_STORAGE_KEY,
  autoUiZoomOf,
  nextUiZoomOf,
  uiZoomChoiceOf,
  type UiZoomChoice,
  type UiZoomStep
} from '@/utils/uiZoom'

/** Dragging a window edge fires a resize per frame; the zoom follows once the drag rests. */
const RESIZE_SETTLE_MS = 150

const SERIALIZER = {
  read: (raw: string): UiZoomChoice => {
    try {
      return uiZoomChoiceOf(JSON.parse(raw))
    } catch {
      // Hand-edited or truncated storage: the default, as the boundary promises.
      return DEFAULT_UI_ZOOM_CHOICE
    }
  },
  write: (choice: UiZoomChoice) => JSON.stringify(choice)
}

/**
 * The UI size: the stored choice and the zoom it stands for right now. Only the Tauri window can
 * zoom its page; in a browser tab the browser's own zoom does this and `isAvailable` is false.
 */
export const useUiZoom = createSharedComposable(() => {
  const isAvailable = isTauri()
  const choice = useStorage<UiZoomChoice>(
    UI_ZOOM_STORAGE_KEY,
    DEFAULT_UI_ZOOM_CHOICE,
    localStorage,
    { serializer: SERIALIZER, writeDefaults: false }
  )
  /** `null` until the window answered; automatic zoom waits for it instead of guessing 100 %. */
  const windowSize = ref<LogicalWindowSize | null>(null)

  const zoom = computed<UiZoomStep | null>(() => {
    if (choice.value !== 'auto') return choice.value
    if (!windowSize.value) return null
    return autoUiZoomOf(windowSize.value.width, windowSize.value.height)
  })

  const step = (direction: -1 | 1) => {
    if (zoom.value === null) return
    choice.value = nextUiZoomOf(zoom.value, direction)
  }
  const reset = () => {
    choice.value = 'auto'
  }

  return { isAvailable, choice, zoom, windowSize, step, reset }
})

/**
 * Applies the UI size to the window and owns its shortcuts; called once at the app root. The
 * automatic zoom reads the window's logical size, never `innerWidth`: that shrinks with the zoom
 * and would feed back into it.
 */
export const useUiZoomApply = () => {
  const { isAvailable, zoom, windowSize, step, reset } = useUiZoom()
  if (!isAvailable) return

  // Only the newest answer counts: a slower, older one would set a size the window left already.
  let latestMeasure = 0
  const measure = async () => {
    const ticket = ++latestMeasure
    const size = await windowService.logicalSize()
    if (ticket !== latestMeasure) return
    // A minimised window reports 0×0 on Windows; it keeps its zoom for when it comes back.
    if (size.width === 0 || size.height === 0) return
    windowSize.value = size
  }
  const measureLater = useDebounceFn(() => measure().catch(handleError), RESIZE_SETTLE_MS)

  measure().catch(handleError)
  const unlisten = windowService.onSizeChange(() => void measureLater())
  tryOnScopeDispose(() => {
    unlisten.then((stop) => stop()).catch(handleError)
  })

  watch(
    zoom,
    (next) => {
      if (next !== null) windowService.setZoom(next).catch(handleError)
    },
    { immediate: true }
  )

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    const action = uiZoomActionOf(event)
    if (!action) return
    event.preventDefault()
    if (action === 'reset') return reset()
    step(action === 'in' ? 1 : -1)
  })
}
