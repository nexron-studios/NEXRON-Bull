/** Where the picked UI size is stored. */
export const UI_ZOOM_STORAGE_KEY = 'bull.uiZoom'

/** The fixed sizes of Settings › Darstellung, smallest first; `auto` picks one of them too. */
export const uiZoomStepList = [0.9, 1, 1.1, 1.25, 1.5] as const
export type UiZoomStep = (typeof uiZoomStepList)[number]

export type UiZoomChoice = 'auto' | UiZoomStep

export const DEFAULT_UI_ZOOM_CHOICE: UiZoomChoice = 'auto'

/**
 * The window Bull is designed for. Automatic zoom never shrinks the room below it: a window
 * twice as wide and high gets the largest step, a 1920×1080 window or smaller stays at 100 %.
 */
const REFERENCE_WIDTH = 1920
const REFERENCE_HEIGHT = 1080
const NEUTRAL_ZOOM: UiZoomStep = 1

/** The stored choice, read at the storage boundary; anything unreadable is the default. */
export const uiZoomChoiceOf = (value: unknown): UiZoomChoice => {
  if (value === 'auto') return 'auto'
  return uiZoomStepList.find((step) => step === value) ?? DEFAULT_UI_ZOOM_CHOICE
}

/**
 * The zoom for a window of this size in logical pixels (the system's own scaling already taken
 * out): the largest step that still leaves at least the reference window, never below 100 %.
 * The smaller side decides, so a wide but short window does not grow out of its height.
 */
export const autoUiZoomOf = (width: number, height: number): UiZoomStep => {
  const room = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT)
  return uiZoomStepList.findLast((step) => step >= NEUTRAL_ZOOM && step <= room) ?? NEUTRAL_ZOOM
}

/** One step larger or smaller than `zoom`; the end of the list stays where it is. */
export const nextUiZoomOf = (zoom: UiZoomStep, direction: -1 | 1): UiZoomStep => {
  const next =
    direction === 1
      ? uiZoomStepList.find((step) => step > zoom)
      : uiZoomStepList.findLast((step) => step < zoom)
  return next ?? zoom
}
