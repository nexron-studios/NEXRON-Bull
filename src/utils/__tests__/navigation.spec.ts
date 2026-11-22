import { describe, expect, it } from 'vitest'
import { pageDirectionOf } from '../navigation'

const page = (name: string, section?: string) => {
  const params: Record<string, string> = section ? { section } : {}
  return { name, params }
}

describe('pageDirectionOf', () => {
  it('should come from below for a page further down the navigation', () => {
    expect(pageDirectionOf(page('overview'), page('usage'), false)).toBe('next')
    expect(pageDirectionOf(page('chat'), page('settings', 'limits'), false)).toBe('next')
  })

  it('should come from above for a page further up', () => {
    expect(pageDirectionOf(page('settings'), page('overview'), false)).toBe('prev')
    expect(pageDirectionOf(page('usage'), page('chat'), true)).toBe('prev')
  })

  it('should follow the order of the settings sections', () => {
    expect(pageDirectionOf(page('settings', 'accounts'), page('settings', 'terminal'), false)).toBe(
      'next'
    )
    expect(pageDirectionOf(page('settings', 'appearance'), page('settings', 'limits'), false)).toBe(
      'prev'
    )
  })

  it('should count the bare settings page as its first section when there is room for one', () => {
    expect(pageDirectionOf(page('settings'), page('settings', 'accounts'), false)).toBeNull()
    expect(pageDirectionOf(page('settings'), page('settings', 'machines'), false)).toBe('next')
  })

  it('should put the list of sections above them on a phone', () => {
    expect(pageDirectionOf(page('settings'), page('settings', 'accounts'), true)).toBe('next')
    expect(pageDirectionOf(page('settings', 'limits'), page('settings'), true)).toBe('prev')
  })
})
