import { describe, expect, it } from 'vitest'
import { markedCopyOf, parseDataUrl, toPendingImage } from '../lightbox'

describe('parseDataUrl', () => {
  it('should split a base64 image data URL into media type and data', () => {
    expect(parseDataUrl('data:image/png;base64,aGk=')).toEqual({
      mediaType: 'image/png',
      data: 'aGk='
    })
  })

  it('should turn away a type Claude does not take', () => {
    expect(parseDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull()
  })

  it('should turn away anything that is not a base64 data URL', () => {
    expect(parseDataUrl('https://example.com/a.png')).toBeNull()
  })
})

describe('toPendingImage', () => {
  it('should keep the id of a composer attachment', () => {
    const image = { id: 'a1', src: 'data:image/jpeg;base64,aGV5', name: 'cat.jpg', bytes: 3 }

    expect(toPendingImage(image, () => 'new')).toEqual({
      id: 'a1',
      name: 'cat.jpg',
      src: 'data:image/jpeg;base64,aGV5',
      bytes: 3,
      isMarked: undefined,
      mediaType: 'image/jpeg',
      data: 'aGV5'
    })
  })

  it('should give an image from the history a new id', () => {
    const image = { src: 'data:image/png;base64,aGk=', name: 'Bild 1', bytes: 2 }

    expect(toPendingImage(image, () => 'new')?.id).toBe('new')
  })
})

describe('markedCopyOf', () => {
  it('should mark the copy and switch the extension to its new encoding', () => {
    const encoded = {
      src: 'data:image/png;base64,aGk=',
      mediaType: 'image/png' as const,
      data: 'aGk=',
      bytes: 2
    }

    expect(markedCopyOf('photo.jpg', encoded, 'm1')).toEqual({
      id: 'm1',
      name: 'photo.png',
      isMarked: true,
      src: 'data:image/png;base64,aGk=',
      mediaType: 'image/png',
      data: 'aGk=',
      bytes: 2
    })
  })
})
