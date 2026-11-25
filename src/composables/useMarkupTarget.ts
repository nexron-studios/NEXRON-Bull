import { inject, provide, type InjectionKey } from 'vue'
import type { PendingImage } from '@/utils/content'

/** What the preview hands to the composer once an image is marked. */
export interface MarkupResult {
  /** The composer attachment it replaces; `null` for an image from the history */
  sourceId: string | null
  /**
   * The marked copy, optionally followed by the original. Empty when only a comment was written on
   * an attachment, which then stays as it is.
   */
  images: PendingImage[]
  /** Trimmed; empty when nothing was written */
  comment: string
}

/**
 * Where the result goes: into the composer to write on (`compose`, "Ins Eingabefeld"), or straight
 * to Claude as a message of its own (`send`).
 */
export const markupHandoffList = ['compose', 'send'] as const
export type MarkupHandoff = (typeof markupHandoffList)[number]

/** Returns false when the composer turned the images away (too many). */
type MarkupTarget = (result: MarkupResult, handoff: MarkupHandoff) => boolean

const MARKUP_TARGET: InjectionKey<MarkupTarget> = Symbol('markupTarget')

// The chat pane holds both the history and the composer, so it connects the two.
export const provideMarkupTarget = (target: MarkupTarget) => provide(MARKUP_TARGET, target)

/** `null` outside a chat pane: the preview then only shows images and offers no markup. */
export const useMarkupTarget = () => inject(MARKUP_TARGET, null)
