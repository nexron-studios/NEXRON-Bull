/**
 * The look of every card Claude hands back (Figma "04 Zustände", "Rückfragen und Meldungen"):
 * the card surface with the card's colour glowing in from the top left corner, framed by the
 * plain hairline. No coloured border and no ring (21.11.2026: a border in the card's
 * colour clashed with Bull). The colour keeps its meaning (red asks for a permission, amber
 * waits); only the look is shared.
 */
export const glowToneList = [
  'critical',
  'brand',
  'read',
  'change',
  'warning',
  'muted',
  'outside',
  'subtle',
  'link'
] as const
export type GlowTone = (typeof glowToneList)[number]

const GLOW_BASE =
  'border border-border bg-card bg-radial-[120%_140%_at_0%_0%] to-transparent to-60%'

// Whole class names, so Tailwind finds every one of them in this file.
const GLOW_TONES: Record<GlowTone, string> = {
  critical: 'from-critical/12',
  brand: 'from-brand/12',
  read: 'from-act-read/12',
  change: 'from-act-change/12',
  warning: 'from-warning/12',
  muted: 'from-muted-foreground/12',
  outside: 'from-act-outside/12',
  subtle: 'from-subtle/12',
  link: 'from-link/12'
}

export const glowClassOf = (tone: GlowTone): string => `${GLOW_BASE} ${GLOW_TONES[tone]}`
