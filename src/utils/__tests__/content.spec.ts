import { describe, expect, it } from 'vitest'
import { buildContent } from '../content'

describe('buildContent', () => {
  it('should put images before the text', () => {
    const image = {
      id: 'i1',
      name: 'a.png',
      mediaType: 'image/png' as const,
      data: 'AAA',
      src: 'data:image/png;base64,AAA',
      bytes: 2
    }
    expect(buildContent('Was ist das?', [image])).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'text', text: 'Was ist das?' }
    ])
  })

  it('should send only the image when there is no text', () => {
    const image = {
      id: 'i1',
      name: 'a.png',
      mediaType: 'image/png' as const,
      data: 'AAA',
      src: 'data:image/png;base64,AAA',
      bytes: 2
    }
    expect(buildContent('', [image])).toHaveLength(1)
  })
})
