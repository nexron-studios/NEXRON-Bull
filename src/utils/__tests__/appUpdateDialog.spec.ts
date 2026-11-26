import { describe, expect, it } from 'vitest'
import {
  formatMegabytes,
  formatPercent,
  updateCardViewOf,
  updateDialogViewOf,
  updateStatusOf
} from '../appUpdateDialog'

const info = { version: '0.7.28', currentVersion: '0.7.27', notes: ['Diktieren im Eingabefeld'] }

describe('updateDialogViewOf', () => {
  it('should show nothing while no update was found', () => {
    expect(updateDialogViewOf({ kind: 'current' }, true, '0.7.27')).toBeNull()
  })

  it('should offer to update now when updates are not automatic', () => {
    const view = updateDialogViewOf({ kind: 'available', info }, false, '0.7.27')

    expect(view?.actions).toEqual(['later', 'update_now'])
    expect(view?.sub).toEqual({ key: 'update.sub_found', params: { current: '0.7.27' } })
  })

  it('should show the download share while downloading', () => {
    const view = updateDialogViewOf(
      { kind: 'downloading', info, downloadedBytes: 31, totalBytes: 50 },
      true,
      '0.7.27'
    )

    expect(view?.progress).toEqual({
      kind: 'download',
      ratio: 0.62,
      downloadedBytes: 31,
      totalBytes: 50
    })
    expect(view?.actions).toEqual(['background'])
  })

  it('should wait for a click to restart once downloaded', () => {
    const view = updateDialogViewOf({ kind: 'ready', info }, true, '0.7.27')

    expect(view?.title).toEqual({ key: 'update.ready_title', params: { version: '0.7.28' } })
    expect(view?.actions).toEqual(['later', 'restart'])
  })

  it('should not let the dialog close while installing', () => {
    const view = updateDialogViewOf({ kind: 'installing', info }, true, '0.7.27')

    expect(view?.isClosable).toBe(false)
    expect(view?.actions).toEqual([])
  })

  it('should name the failed step and keep the updater message', () => {
    const view = updateDialogViewOf(
      { kind: 'failed', step: 'download', info, reason: 'error sending request' },
      true,
      '0.7.27'
    )

    expect(view?.error).toEqual({
      text: { key: 'update.error_download' },
      reason: 'error sending request'
    })
    expect(view?.hint).toEqual({ key: 'update.hint_failed', params: { current: '0.7.27' } })
  })

  it('should name the running version when the check failed', () => {
    const view = updateDialogViewOf(
      { kind: 'failed', step: 'check', info: null, reason: 'timeout' },
      true,
      '0.7.27'
    )

    expect(view?.sub).toEqual({ key: 'update.sub_failed_check', params: { current: '0.7.27' } })
  })
})

describe('formatMegabytes', () => {
  it('should show megabytes with one decimal in German', () => {
    expect(formatMegabytes('de', 38_200_000)).toBe('38,2 MB')
  })
})

describe('formatPercent', () => {
  it('should round to whole percent', () => {
    expect(formatPercent('en', 0.624)).toBe('62%')
  })
})

describe('updateCardViewOf', () => {
  it('should offer a restart once the update is downloaded', () => {
    expect(updateCardViewOf({ kind: 'ready', info })).toEqual({
      title: { key: 'update.card.ready_title', params: { version: '0.7.28' } },
      sub: { key: 'update.card.ready_sub' },
      action: 'restart',
      isFailed: false
    })
  })

  it('should show the download share without a button', () => {
    const view = updateCardViewOf({
      kind: 'downloading',
      info,
      downloadedBytes: 1,
      totalBytes: 4
    })

    expect(view?.ratio).toBe(0.25)
    expect(view?.action).toBeNull()
  })

  it('should stay hidden when only the background check failed', () => {
    expect(updateCardViewOf({ kind: 'failed', step: 'check', info: null, reason: 'x' })).toBeNull()
  })
})

describe('updateStatusOf', () => {
  it('should call a checked Bull without update current', () => {
    expect(updateStatusOf({ kind: 'current' }, true)).toEqual({
      text: { key: 'settings.updates.status_current' },
      tone: 'good'
    })
  })

  it('should say when Bull never looked', () => {
    expect(updateStatusOf({ kind: 'idle' }, false).text).toEqual({
      key: 'settings.updates.status_never'
    })
  })

  it('should name the version that waits for the restart', () => {
    expect(updateStatusOf({ kind: 'ready', info }, true).text).toEqual({
      key: 'settings.updates.status_ready',
      params: { version: '0.7.28' }
    })
  })
})
