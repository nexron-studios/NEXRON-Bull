import { describe, expect, it } from 'vitest'
import {
  UPDATE_CHECK_INTERVAL_MS,
  downloadRatioOf,
  isUpdateCheckDue,
  releaseNoteLinesOf,
  updateInfoOf
} from '../appUpdate'

describe('releaseNoteLinesOf', () => {
  it('should return the list items without markers, marks and link targets', () => {
    const body = [
      '## Neu',
      '',
      '- **Diktieren** direkt im Eingabefeld',
      '* Töne für [Freigaben](https://example.com/a)',
      '1. `agentd` startet schneller'
    ].join('\n')

    expect(releaseNoteLinesOf(body)).toEqual([
      'Diktieren direkt im Eingabefeld',
      'Töne für Freigaben',
      'agentd startet schneller'
    ])
  })

  it('should fall back to the paragraphs when the notes have no list', () => {
    expect(releaseNoteLinesOf('# Bull 0.7.28\r\n\r\nKleine Fehler behoben.\r\n')).toEqual([
      'Kleine Fehler behoben.'
    ])
  })

  it('should keep at most six lines', () => {
    const body = Array.from({ length: 9 }, (_, index) => `- Punkt ${index + 1}`).join('\n')

    expect(releaseNoteLinesOf(body)).toHaveLength(6)
  })

  it('should return nothing for missing notes', () => {
    expect(releaseNoteLinesOf(undefined)).toEqual([])
  })
})

describe('downloadRatioOf', () => {
  it('should return the share downloaded so far', () => {
    expect(downloadRatioOf(25, 100)).toBe(0.25)
  })

  it('should never go past one', () => {
    expect(downloadRatioOf(120, 100)).toBe(1)
  })

  it('should return null while the size is unknown', () => {
    expect(downloadRatioOf(25, null)).toBeNull()
  })
})

describe('isUpdateCheckDue', () => {
  it('should be due when Bull never checked', () => {
    expect(isUpdateCheckDue(0, Date.UTC(2026, 10, 26))).toBe(true)
  })

  it('should not be due within the interval', () => {
    expect(isUpdateCheckDue(1_000, 1_000 + UPDATE_CHECK_INTERVAL_MS - 1)).toBe(false)
  })

  it('should be due once the interval has passed', () => {
    expect(isUpdateCheckDue(1_000, 1_000 + UPDATE_CHECK_INTERVAL_MS)).toBe(true)
  })
})

describe('updateInfoOf', () => {
  const info = { version: '0.7.28', currentVersion: '0.7.27', notes: [] }

  it('should return the update of a phase that has one', () => {
    expect(updateInfoOf({ kind: 'ready', info })).toEqual(info)
  })

  it('should return null while nothing was found', () => {
    expect(updateInfoOf({ kind: 'current' })).toBeNull()
  })
})
