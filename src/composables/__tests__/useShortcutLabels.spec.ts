import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOVE_CHORD, NEW_SESSION_CHORD } from '@/utils/shortcuts'
import { useShortcutLabels } from '../useShortcutLabels'

const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'

const runningOn = (userAgent: string) =>
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)

describe('useShortcutLabels', () => {
  afterEach(() => vi.restoreAllMocks())

  it('should show the Command key on a Mac', () => {
    runningOn(MAC)
    const { labelOf, ariaOf } = useShortcutLabels()
    expect([labelOf(NEW_SESSION_CHORD), ariaOf(MOVE_CHORD)]).toEqual([
      '⌘T',
      'Meta+Shift+ArrowLeft Meta+Shift+ArrowRight'
    ])
  })

  it('should show Ctrl on Windows', () => {
    runningOn(WINDOWS)
    const { labelOf, ariaOf } = useShortcutLabels()
    expect([labelOf(NEW_SESSION_CHORD), ariaOf(MOVE_CHORD)]).toEqual([
      'Ctrl T',
      'Control+Shift+ArrowLeft Control+Shift+ArrowRight'
    ])
  })
})
