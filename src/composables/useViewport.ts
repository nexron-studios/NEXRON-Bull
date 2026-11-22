import { createSharedComposable, useMediaQuery } from '@vueuse/core'

/** Phone width: the session list is the home screen and a chat is pushed over it. */
export const PHONE_QUERY = '(max-width: 640px)'
/** Below this the chat needs the whole width; the sidebar becomes a drawer. */
export const NARROW_QUERY = '(max-width: 899px)'

// One media query listener each for the whole app, however many components ask.
export const useIsPhone = createSharedComposable(() => useMediaQuery(PHONE_QUERY))
export const useIsNarrow = createSharedComposable(() => useMediaQuery(NARROW_QUERY))
