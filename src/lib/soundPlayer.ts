import { handleError } from '@/lib/error'
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
/** The same sound asked for in a burst would pile up; within this gap the repeat is dropped. */
const MIN_GAP_MS = 250
/** A browser without a user gesture yet leaves `resume()` pending; this long is worth waiting. */
const RESUME_WAIT_MS = 100

let context: AudioContext | null = null
let output: AudioNode | null = null
/** Per sound, so a "needs you" right after a "done" still plays. */
const lastPlayedAt = new Map<NotifySoundId, number>()
/** What a person does that lets a browser play audio; pointerdown alone does not on iOS. */
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'] as const
let isUnlockArmed = false

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
 * Schedules one of Bull's sounds and tells whether it plays. The Tauri window allows audio from the start
 * on every system (wry enables autoplay in WebView2, WKWebView and WebKitGTK); a browser tab holds
 * it back until the user touched the page (`unlockSounds`). A sound asked for before that stays
 * silent rather than playing late on the next click, and the caller can fall back.
 */
const schedule = async (id: NotifySoundId): Promise<boolean> => {
  const now = Date.now()
  const last = lastPlayedAt.get(id)
  if (last !== undefined && now - last < MIN_GAP_MS) return true
  const audio = contextOf()
  if (audio.state === 'suspended')
    await Promise.race([
      audio.resume(),
      new Promise((resolve) => setTimeout(resolve, RESUME_WAIT_MS))
    ])
  if (audio.state !== 'running') return false
  lastPlayedAt.set(id, now)
  const origin = audio.currentTime
  for (const tone of SOUND_RECIPES[id]) playTone(audio, origin, tone)
  return true
}

/** Never rejects: a webview without working audio is reported once per try and counts as silent. */
export const playSound = (id: NotifySoundId): Promise<boolean> =>
  schedule(id).catch((error: unknown) => {
    handleError(error)
    return false
  })

/**
 * Lets the user's clicks and key presses allow audio for sounds that come later, once per app.
 * Stays armed: a phone suspends audio again when the app goes to the background. `isWanted` keeps
 * it from creating audio at all while sound is off.
 */
export const unlockSounds = (isWanted: () => boolean): void => {
  if (isUnlockArmed) return
  isUnlockArmed = true
  const unlock = () => {
    if (!isWanted() || context?.state === 'running') return
    contextOf().resume().catch(handleError)
  }
  for (const event of UNLOCK_EVENTS)
    window.addEventListener(event, unlock, { capture: true, passive: true })
}
