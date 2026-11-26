import type { NotifyReason } from '@/utils/notifications'

/**
 * Bull's own notification sounds: six for a finished chat, six for a chat that needs the user.
 * Synthesised from these recipes at play time (`src/lib/soundPlayer.ts`), so no audio files ship.
 * Kept quiet on purpose (26.11.2026, Jonas: "nicht nervig"): soft attacks, sine and triangle
 * waves only, mid register, under a second. "Done" sounds settle downwards or ring out once;
 * "attention" sounds rise or knock twice, like a question.
 */
export const soundGroupList = ['done', 'attention'] as const
export type SoundGroup = (typeof soundGroupList)[number]

export const SOUNDS_OF_GROUP = {
  done: ['drop', 'glass', 'marimba', 'harp', 'bell', 'breath'],
  attention: ['knock', 'ask', 'ping', 'nudge', 'crystal', 'duet']
} as const
export type SoundOfGroup<G extends SoundGroup> = (typeof SOUNDS_OF_GROUP)[G][number]
export type NotifySoundId = SoundOfGroup<SoundGroup>
/** One picked sound per group; a group only ever holds one of its own sounds. */
export type PickedSounds = { [G in SoundGroup]: SoundOfGroup<G> }

interface SoundPartial {
  /** Multiple of the tone's frequency */
  ratio: number
  /** Level relative to the tone's own */
  gain: number
}

export interface SoundTone {
  /** Start, in seconds after the sound begins */
  at: number
  frequency: number
  /** The pitch it glides to during the attack and the first part of the decay */
  glideTo?: number
  wave: 'sine' | 'triangle'
  /** Peak level from 0 to 1, before the master volume */
  gain: number
  /** Seconds to reach the peak; never instant, a hard edge is what makes a click */
  attack: number
  /** Seconds from the peak to silence */
  decay: number
  /** Overtones; they fade twice as fast as the tone, like a struck object */
  partials?: readonly SoundPartial[]
}

const NOTE = {
  C4: 261.63,
  G4: 392,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F_SHARP5: 739.99,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  B6: 1975.53
} as const

/** The fourth partial is what makes a struck bar sound like wood rather than a whistle. */
const WOOD = [{ ratio: 4, gain: 0.25 }] as const
/** An inharmonic partial gives the ring of glass. */
const GLASS = [{ ratio: 2.76, gain: 0.12 }] as const

const tone = (fields: Omit<SoundTone, 'wave' | 'attack'> & Partial<SoundTone>): SoundTone => ({
  wave: 'sine',
  attack: 0.006,
  ...fields
})

export const SOUND_RECIPES: Record<NotifySoundId, readonly SoundTone[]> = {
  drop: [tone({ at: 0, frequency: 620, glideTo: 1100, gain: 0.5, decay: 0.28 })],
  glass: [
    tone({ at: 0, frequency: NOTE.E6, gain: 0.32, attack: 0.004, decay: 0.95, partials: GLASS })
  ],
  marimba: [
    tone({ at: 0, frequency: NOTE.E5, gain: 0.45, attack: 0.003, decay: 0.42, partials: WOOD }),
    tone({ at: 0.13, frequency: NOTE.C5, gain: 0.45, attack: 0.003, decay: 0.5, partials: WOOD })
  ],
  harp: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].map((frequency, index) =>
    tone({ at: index * 0.06, frequency, wave: 'triangle', gain: 0.2, decay: 0.7 })
  ),
  bell: [
    tone({
      at: 0,
      frequency: NOTE.A5,
      gain: 0.28,
      attack: 0.004,
      decay: 1.2,
      partials: [
        { ratio: 2, gain: 0.15 },
        { ratio: 3.01, gain: 0.07 },
        { ratio: 4.2, gain: 0.04 }
      ]
    })
  ],
  breath: [NOTE.C4, NOTE.G4, NOTE.E5].map((frequency) =>
    tone({ at: 0, frequency, gain: 0.16, attack: 0.12, decay: 0.85 })
  ),

  knock: [0, 0.16].map((at) =>
    tone({ at, frequency: 420, glideTo: 300, gain: 0.55, attack: 0.002, decay: 0.09 })
  ),
  ask: [
    tone({
      at: 0,
      frequency: NOTE.C5,
      gain: 0.4,
      decay: 0.32,
      partials: [{ ratio: 2, gain: 0.1 }]
    }),
    tone({
      at: 0.14,
      frequency: NOTE.G5,
      gain: 0.4,
      decay: 0.4,
      partials: [{ ratio: 2, gain: 0.1 }]
    })
  ],
  ping: [
    tone({ at: 0, frequency: NOTE.D6, wave: 'triangle', gain: 0.3, attack: 0.003, decay: 0.25 }),
    tone({ at: 0.16, frequency: NOTE.D6, wave: 'triangle', gain: 0.2, attack: 0.003, decay: 0.3 })
  ],
  nudge: [NOTE.E5, NOTE.G5, NOTE.C6].map((frequency, index) =>
    tone({ at: index * 0.07, frequency, gain: 0.32, decay: 0.24 })
  ),
  crystal: [
    tone({ at: 0, frequency: NOTE.E6, gain: 0.26, attack: 0.004, decay: 0.45, partials: GLASS }),
    tone({ at: 0.1, frequency: NOTE.B6, gain: 0.18, attack: 0.004, decay: 0.6, partials: GLASS })
  ],
  duet: [
    tone({ at: 0, frequency: NOTE.D5, gain: 0.24, decay: 0.3 }),
    tone({ at: 0, frequency: NOTE.F_SHARP5, gain: 0.24, decay: 0.3 }),
    tone({ at: 0.18, frequency: NOTE.E5, gain: 0.24, decay: 0.42 }),
    tone({ at: 0.18, frequency: NOTE.A5, gain: 0.24, decay: 0.42 })
  ]
}

export const DEFAULT_SOUNDS: PickedSounds = {
  done: 'harp',
  attention: 'ping'
}

/** Seconds from the first tone's start until the last one is silent. */
export const soundLengthOf = (tones: readonly SoundTone[]): number =>
  Math.max(...tones.map(({ at, attack, decay }) => at + attack + decay))

/** Finished is "done"; everything else a tab tells wants the user to look: "attention". */
export const soundGroupOf = (reason: NotifyReason): SoundGroup =>
  reason === 'finished' ? 'done' : 'attention'

/** The stored choice for a group if it is one of that group's sounds, else `fallback`. */
export const soundOfGroup = <G extends SoundGroup>(
  group: G,
  stored: unknown,
  fallback: SoundOfGroup<G>
): SoundOfGroup<G> =>
  (SOUNDS_OF_GROUP[group] as readonly unknown[]).includes(stored)
    ? (stored as SoundOfGroup<G>)
    : fallback
