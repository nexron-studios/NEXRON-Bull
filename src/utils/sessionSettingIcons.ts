import type { Component } from 'vue'
import { ClipboardList, FilePen, Hand, ShieldCheck, ShieldOff, Zap } from '@lucide/vue'
import type { PermissionMode } from '@/utils/chatTab'
import type { Effort } from '@/utils/sessionSettings'

export interface ModeLook {
  icon: Component
  /**
   * A text-colour utility from the token layer, important: a highlighted menu row recolours
   * everything inside it, and the mode's colour must still tell a risky mode apart.
   */
  tone: string
}

export interface EffortLook {
  /** Background (and ring) of the badge */
  badge: string
  /** The step bars up to the level */
  on: string
  /** The step bars above it */
  off: string
  /** Colour of the label */
  text: string
}

/**
 * The thinking bar's effort badge grows louder with the step (19.11.2026, Figma "37" A):
 * muted, neutral, brand-tinted, stronger tint, solid brand. High keeps its label in the foreground, the brand
 * blue reaches only 3.7:1 as text; Max sits on brand-strong, which holds white text at 5.1:1.
 */
export const effortLookOf = (effort: Effort): EffortLook => {
  switch (effort) {
    case 'low':
      return {
        badge: 'bg-muted',
        on: 'bg-muted-foreground',
        off: 'bg-border',
        text: 'text-muted-foreground'
      }
    case 'medium':
      return { badge: 'bg-muted', on: 'bg-foreground', off: 'bg-border', text: 'text-foreground' }
    case 'high':
      return {
        badge: 'bg-brand/15 ring-1 ring-brand/40 effort-sheen',
        on: 'bg-brand',
        off: 'bg-border',
        text: 'text-foreground'
      }
    case 'xhigh':
      return {
        badge: 'bg-brand/30 ring-1 ring-brand/60 effort-sheen',
        on: 'bg-brand',
        off: 'bg-border',
        text: 'text-foreground'
      }
    case 'max':
      return {
        badge: 'bg-brand-strong effort-sheen effort-glow',
        on: 'bg-brand-foreground',
        off: 'bg-brand-foreground/35',
        text: 'text-brand-foreground'
      }
    default: {
      const unhandled: never = effort
      throw new Error(`Unhandled effort: ${unhandled}`)
    }
  }
}

/** Colours after Figma "33": change for edits, read for planning, warning (working) for auto. */
export const modeLookOf = (mode: PermissionMode): ModeLook => {
  switch (mode) {
    case 'default':
      return { icon: Hand, tone: 'text-muted-foreground!' }
    case 'acceptEdits':
      return { icon: FilePen, tone: 'text-act-change!' }
    case 'plan':
      return { icon: ClipboardList, tone: 'text-act-read!' }
    case 'auto':
      return { icon: Zap, tone: 'text-warning!' }
    // Set in the account only: everything runs unasked, or only what is allowed already.
    case 'bypassPermissions':
      return { icon: ShieldOff, tone: 'text-critical!' }
    case 'dontAsk':
      return { icon: ShieldCheck, tone: 'text-muted-foreground!' }
    default: {
      const unhandled: never = mode
      throw new Error(`Unhandled permission mode: ${unhandled}`)
    }
  }
}
