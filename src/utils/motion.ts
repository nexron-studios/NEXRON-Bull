import type { StreamItem } from '@/utils/chatStream'

/** Which way content moves when the active tab, page or settings section changes. */
export type TabDirection = 'next' | 'prev'

/**
 * `next` when the new tab sits right of the old one in the tab bar. A tab that is gone (just
 * closed) or unknown counts as left of everything, so its successor comes from the right.
 */
export const tabDirectionOf = (ids: string[], from: string | null, to: string): TabDirection =>
  ids.indexOf(to) >= ids.indexOf(from ?? '') ? 'next' : 'prev'

/**
 * Keys that were appended behind the previous last item. A first fill (from nothing) and older
 * history put in front are loads, not arrivals: neither should animate.
 */
export const appendedKeys = (previous: string[], next: string[]): string[] => {
  const last = previous.at(-1)
  if (last === undefined) return []
  const at = next.indexOf(last)
  if (at < 0) return []
  const known = new Set(previous)
  return next.slice(at + 1).filter((key) => !known.has(key))
}

/**
 * Claude's finished text and thinking replace what was already streamed on screen; fading them in
 * again would blink. Everything else is new to the reader.
 */
export const isAnimatedOnArrival = (item: StreamItem): boolean => {
  if (item.kind === 'reasoning') return false
  return item.kind !== 'message' || item.message.role !== 'assistant'
}

/** Where a segmented control's marker sits: offset and width inside its group, in px. */
export interface MarkerBox {
  x: number
  width: number
}

/**
 * The marker's glide from one choice to the next, as FLIP keyframes: the element already has the
 * new width and offset, and starts drawn where the old choice was. Only `transform` moves, so the
 * width never animates. Null when there is nothing to glide from or to.
 */
export const markerGlideOf = (from: MarkerBox | null, to: MarkerBox): Keyframe[] | null => {
  if (!from || from.width <= 0 || to.width <= 0) return null
  if (from.x === to.x && from.width === to.width) return null
  return [
    { transform: `translateX(${from.x}px) scaleX(${from.width / to.width})` },
    { transform: `translateX(${to.x}px) scaleX(1)` }
  ]
}

/** An element's drawn left edge and its own 2D transform: translation, scale and origin, in px. */
export interface DrawnLeft {
  drawnLeft: number
  shift: number
  scale: number
  origin: number
}

/**
 * Where an element is laid out, from where it is drawn: its own transform (a FLIP slide, a press
 * scale around its origin) taken out again.
 */
export const layoutLeftOf = ({ drawnLeft, shift, scale, origin }: DrawnLeft): number =>
  drawnLeft - shift - origin * (1 - scale)

/** Where a spring stands relative to its target, in px, and how fast it moves, in px/s. */
export interface SpringState {
  offset: number
  velocity: number
}

// Apple's spring with duration 0.3 s and bounce 0, the one sampled into --ease-spring-smooth: it
// covers 98 % of the way in 280 ms.
const SMOOTH_SPRING_OMEGA = (2 * Math.PI) / 0.3

/**
 * One step of the smooth spring, solved exactly for a critically damped spring. The offset is
 * measured from the target, so a target that moves (the chat grew) only changes the offset and
 * the speed carries on instead of restarting from zero.
 */
export const springStepOf = ({ offset, velocity }: SpringState, elapsedMs: number): SpringState => {
  const t = Math.max(0, elapsedMs) / 1000
  const decay = Math.exp(-SMOOTH_SPRING_OMEGA * t)
  const pull = velocity + SMOOTH_SPRING_OMEGA * offset
  return {
    offset: (offset + pull * t) * decay,
    velocity: (velocity - SMOOTH_SPRING_OMEGA * pull * t) * decay
  }
}
