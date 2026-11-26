import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DictationError, dictationService } from '../dictation.service'

const { invoke, listen, platform } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => undefined)),
  platform: { isDesktop: true }
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen }))
vi.mock('@/lib/platform', () => ({ isDesktopApp: () => platform.isDesktop }))

describe('dictationService', () => {
  beforeEach(() => {
    invoke.mockReset()
    listen.mockClear()
    platform.isDesktop = true
  })

  it('should not listen for Tauri events in a browser', () => {
    platform.isDesktop = false

    dictationService.onEvent(() => undefined)

    expect(listen).not.toHaveBeenCalled()
  })

  it('should hand the transcript back from the stop command', async () => {
    invoke.mockResolvedValue('Hallo Welt')

    await expect(dictationService.stop()).resolves.toBe('Hallo Welt')
    expect(invoke).toHaveBeenCalledWith('dictation_stop', undefined)
  })

  it('should start with the language to dictate in', async () => {
    invoke.mockResolvedValue(undefined)

    await dictationService.start('de', 3)

    expect(invoke).toHaveBeenCalledWith('dictation_start', { language: 'de', hold: 3 })
  })

  it('should turn a failure of the Rust side into a DictationError', async () => {
    invoke.mockRejectedValue({ code: 'nothing_heard', detail: 'No speech detected' })

    const error = await dictationService.stop().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DictationError)
    expect(error).toMatchObject({ code: 'nothing_heard', detail: 'No speech detected' })
  })

  it('should leave any other rejection as it is', async () => {
    invoke.mockRejectedValue('command dictation_stop not found')

    await expect(dictationService.stop()).rejects.toBe('command dictation_stop not found')
  })
})
