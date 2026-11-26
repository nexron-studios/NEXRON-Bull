import { SOUND_RECIPES, type NotifySoundId, type SoundTone } from '@/utils/notifySounds'

/** All sounds through one quiet master level, so none of them is ever loud. */
const MASTER_GAIN = 0.35
/** Takes the edge off the triangle waves and the high glass partials. */
const LOWPASS_HZ = 5_000
/** `exponentialRampToValueAtTime` cannot reach 0; this is silence for the ear. */
const SILENT = 0.0001
/** Overtones fade this much faster than their tone, like a struck object. */
const PARTIAL_DECAY_SHARE = 0.5
/** Share of the decay over which a gliding pitch arrives. */
const GLIDE_SHARE = 0.4
/** Sounds asked for in a burst would pile up; one within this gap of the last is dropped. */
const MIN_GAP_MS = 250
/** A browser without a user gesture yet leaves `resume()` pending; this long is worth waiting. */
const RESUME_WAIT_MS = 100

let context: AudioContext | null = null
let output: AudioNode | null = null
let lastPlayedAt = 0

const outputOf = (audio: AudioContext): AudioNode => {
  if (output) return output
  const master = audio.createGain()
  master.gain.value = MASTER_GAIN
  const lowpass = audio.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = LOWPASS_HZ
  master.connect(lowpass).connect(audio.destination)
  output = master
  return master
}

const contextOf = (): AudioContext => {
  context ??= new AudioContext()
  return context
}

const playVoice = (
  audio: AudioContext,
  start: number,
  { frequency, glideTo, wave, attack, decay }: SoundTone,
  gain: number
) => {
  const oscillator = audio.createOscillator()
  oscillator.type = wave
  oscillator.frequency.setValueAtTime(frequency, start)
  if (glideTo)
    oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + attack + decay * GLIDE_SHARE)
  const envelope = audio.createGain()
  envelope.gain.setValueAtTime(SILENT, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + attack)
  envelope.gain.exponentialRampToValueAtTime(SILENT, start + attack + decay)
  oscillator.connect(envelope).connect(outputOf(audio))
  oscillator.start(start)
  oscillator.stop(start + attack + decay)
}

const playTone = (audio: AudioContext, origin: number, tone: SoundTone) => {
  const start = origin + tone.at
  playVoice(audio, start, tone, tone.gain)
  for (const { ratio, gain } of tone.partials ?? [])
    playVoice(
      audio,
      start,
      {
        ...tone,
        frequency: tone.frequency * ratio,
        glideTo: tone.glideTo && tone.glideTo * ratio,
        decay: tone.decay * PARTIAL_DECAY_SHARE
      },
      tone.gain * gain
    )
}

/**
 * Plays one of Bull's sounds. The Tauri window allows audio from the start (wry passes
 * `--autoplay-policy=no-user-gesture-required`); a browser tab holds it back until the user
 * touched the page once (`unlockSounds`). A sound asked for before that stays silent rather than
 * playing late on the next click.
 */
export const playSound = async (id: NotifySoundId): Promise<void> => {
  const now = Date.now()
  if (now - lastPlayedAt < MIN_GAP_MS) return
  lastPlayedAt = now
  const audio = contextOf()
  if (audio.state === 'suspended')
    await Promise.race([
      audio.resume(),
      new Promise((resolve) => setTimeout(resolve, RESUME_WAIT_MS))
    ])
  if (audio.state !== 'running') return
  const origin = audio.currentTime
  for (const tone of SOUND_RECIPES[id]) playTone(audio, origin, tone)
}

/** Lets the first click or key press of the session allow audio, for sounds that come later. */
export const unlockSounds = (): void => {
  const unlock = () => {
    contextOf()
      .resume()
      .catch((error: unknown) => console.warn('sounds.unlock_failed', { error }))
  }
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('keydown', unlock, { once: true, capture: true })
}
