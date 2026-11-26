import { describe, expect, it } from 'vitest'
import {
  SOUND_RECIPES,
  SOUNDS_OF_GROUP,
  soundGroupOf,
  soundLengthOf,
  soundOfGroup,
  type NotifySoundId
} from '../notifySounds'

const ALL_SOUNDS = Object.keys(SOUND_RECIPES) as NotifySoundId[]
/** "Nicht nervig": nothing rings on for longer than this, in seconds. */
const MAX_LENGTH_S = 1.3
/** The loudest moment of a sound, tones that overlap added up, stays below full scale. */
const MAX_SUMMED_GAIN = 0.8

describe('SOUNDS_OF_GROUP', () => {
  it('should offer six sounds for a finished chat and six for one that needs the user', () => {
    expect(SOUNDS_OF_GROUP.done).toEqual(['drop', 'glass', 'marimba', 'harp', 'bell', 'breath'])
    expect(SOUNDS_OF_GROUP.attention).toEqual(['knock', 'ask', 'ping', 'nudge', 'crystal', 'duet'])
  })
})

describe('SOUND_RECIPES', () => {
  it.each(ALL_SOUNDS)('should let %s fade out within the length limit', (id) => {
    expect(soundLengthOf(SOUND_RECIPES[id])).toBeLessThanOrEqual(MAX_LENGTH_S)
  })

  it.each(ALL_SOUNDS)('should start %s softly, never with an instant edge', (id) => {
    expect(SOUND_RECIPES[id].every((tone) => tone.attack > 0)).toBe(true)
  })

  it.each(ALL_SOUNDS)('should keep %s below full scale where its tones overlap', (id) => {
    const tones = SOUND_RECIPES[id]
    const loudest = Math.max(
      ...tones.map(({ at }) =>
        tones.filter((tone) => tone.at === at).reduce((sum, tone) => sum + tone.gain, 0)
      )
    )
    expect(loudest).toBeLessThanOrEqual(MAX_SUMMED_GAIN)
  })
})

describe('soundLengthOf', () => {
  it('should end with the tone that falls silent last', () => {
    const tones = [
      { at: 0, frequency: 440, wave: 'sine', gain: 0.3, attack: 0.01, decay: 0.5 },
      { at: 0.2, frequency: 660, wave: 'sine', gain: 0.3, attack: 0.01, decay: 0.4 }
    ] as const
    expect(soundLengthOf(tones)).toBeCloseTo(0.61)
  })
})

describe('soundGroupOf', () => {
  it('should play the done sound for a finished chat', () => {
    expect(soundGroupOf('finished')).toBe('done')
  })

  it.each(['approval', 'question', 'plan', 'failed'] as const)(
    'should play the attention sound for %s',
    (reason) => {
      expect(soundGroupOf(reason)).toBe('attention')
    }
  )
})

describe('soundOfGroup', () => {
  it('should keep a stored sound of the same group', () => {
    expect(soundOfGroup('done', 'bell')).toBe('bell')
  })

  it('should fall back to the default for a sound of the other group', () => {
    expect(soundOfGroup('done', 'knock')).toBe('marimba')
  })

  it('should fall back to the default for an unknown value', () => {
    expect(soundOfGroup('attention', 42)).toBe('ask')
  })
})
