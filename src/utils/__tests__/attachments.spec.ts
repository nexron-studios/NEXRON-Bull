import { describe, expect, it } from 'vitest'
import type { Block } from '@/types/agentd.type'
import {
  MAX_IMAGE_FILE_BYTES,
  base64Bytes,
  blockImages,
  clockStamp,
  encodedBytes,
  extensionOf,
  fileNameOf,
  formatBytes,
  groupRejected,
  imageBlocksOf,
  promptKeyOf,
  imageMeta,
  isGenericPasteName,
  placeMarked,
  prependLine,
  renameExtension,
  sortIncoming,
  splitSettled,
  stepIndex,
  truncateName,
  uniqueName
} from '../attachments'
import { MAX_IMAGE_BYTES } from '../content'

const png = (name: string, size = 1000) => ({ name, type: 'image/png', size })

describe('sortIncoming', () => {
  it('should accept supported images and keep their media type', () => {
    const file = png('a.png')
    expect(sortIncoming([file], 10)).toEqual({
      accepted: [{ file, mediaType: 'image/png', isOversized: false }],
      rejected: []
    })
  })

  it('should reject other types and GIFs over the size limit with their reason', () => {
    const files = [
      { name: 'notes.txt', type: 'text/plain', size: 10 },
      { name: 'old.bmp', type: 'image/bmp', size: 10 },
      { name: 'loop.gif', type: 'image/gif', size: MAX_IMAGE_BYTES + 1 }
    ]
    expect(sortIncoming(files, 10).rejected).toEqual([
      { name: 'notes.txt', reason: 'type' },
      { name: 'old.bmp', reason: 'type' },
      { name: 'loop.gif', reason: 'size' }
    ])
  })

  it('should accept other images over the limit as oversized, measured as base64', () => {
    const files = [png('fits.png', MAX_IMAGE_FILE_BYTES), png('over.png', MAX_IMAGE_FILE_BYTES + 1)]
    const result = sortIncoming(files, 10)
    expect([
      result.accepted.map((item) => [item.file.name, item.isOversized]),
      result.rejected
    ]).toEqual([
      [
        ['fits.png', false],
        ['over.png', true]
      ],
      []
    ])
  })

  it('should skip entries without a type, such as dropped folders, silently', () => {
    expect(sortIncoming([{ name: 'Screenshots', type: '', size: 0 }], 10)).toEqual({
      accepted: [],
      rejected: []
    })
  })

  it('should turn away valid images once the free room is used up', () => {
    const result = sortIncoming([png('a.png'), png('b.png'), png('c.png')], 2)
    expect([result.accepted.map((item) => item.file.name), result.rejected]).toEqual([
      ['a.png', 'b.png'],
      [{ name: 'c.png', reason: 'limit' }]
    ])
  })
})

describe('groupRejected', () => {
  it('should list names per reason in a fixed order and skip empty reasons', () => {
    expect(
      groupRejected([
        { name: 'c.png', reason: 'limit' },
        { name: 'a.txt', reason: 'type' },
        { name: 'b.pdf', reason: 'type' }
      ])
    ).toEqual([
      { reason: 'type', names: ['a.txt', 'b.pdf'] },
      { reason: 'limit', names: ['c.png'] }
    ])
  })
})

describe('encodedBytes', () => {
  it('should round up to whole base64 groups of four', () => {
    expect([encodedBytes(3), encodedBytes(4), encodedBytes(0)]).toEqual([4, 8, 0])
  })

  it('should put the largest file that fits at 3.75 MB', () => {
    expect([MAX_IMAGE_FILE_BYTES, encodedBytes(MAX_IMAGE_FILE_BYTES)]).toEqual([
      3932160,
      MAX_IMAGE_BYTES
    ])
  })
})

describe('splitSettled', () => {
  it('should pair values with their items and collect the failed items with the reason', () => {
    const results: PromiseSettledResult<string>[] = [
      { status: 'fulfilled', value: 'A' },
      { status: 'rejected', reason: 'nope' },
      { status: 'fulfilled', value: 'C' }
    ]
    expect(splitSettled(['a', 'b', 'c'], results)).toEqual({
      done: [
        { item: 'a', value: 'A' },
        { item: 'c', value: 'C' }
      ],
      failed: [{ item: 'b', reason: 'nope' }]
    })
  })
})

describe('base64Bytes', () => {
  it('should count decoded bytes including padding', () => {
    // 'aGk=' is "hi", 'aGV5' is "hey", 'aA==' is "h"
    expect([base64Bytes('aGk='), base64Bytes('aGV5'), base64Bytes('aA==')]).toEqual([2, 3, 1])
  })
})

describe('formatBytes', () => {
  it('should pick bytes, kilobytes or megabytes by size', () => {
    expect([
      formatBytes(512, 'en'),
      formatBytes(12 * 1024, 'en'),
      formatBytes(1.5 * 1024 * 1024, 'de'),
      formatBytes(MAX_IMAGE_FILE_BYTES, 'de')
    ]).toEqual(['512 byte', '12 kB', '1,5 MB', '3,75 MB'])
  })
})

describe('stepIndex', () => {
  it('should wrap around at both ends', () => {
    expect([stepIndex(0, -1, 5), stepIndex(4, 1, 5), stepIndex(2, 1, 5)]).toEqual([4, 0, 3])
  })
})

describe('imageBlocksOf', () => {
  it('should keep only the image blocks in their order', () => {
    const blocks: Block[] = [
      { type: 'image', media_type: 'image/png', data: 'aGk=' },
      { type: 'text', text: 'Was ist das?' },
      { type: 'image', media_type: 'image/jpeg', data: 'aGV5' }
    ]
    expect(imageBlocksOf(blocks)).toEqual([
      { type: 'image', media_type: 'image/png', data: 'aGk=' },
      { type: 'image', media_type: 'image/jpeg', data: 'aGV5' }
    ])
  })
})

describe('blockImages', () => {
  it('should build data URLs and number the images', () => {
    const blocks = [
      { type: 'image' as const, media_type: 'image/png', data: 'aGk=' },
      { type: 'image' as const, media_type: 'image/jpeg', data: 'aGV5' }
    ]
    expect(blockImages(blocks, (n) => `Bild ${n}`)).toEqual([
      { src: 'data:image/png;base64,aGk=', name: 'Bild 1', bytes: 2 },
      { src: 'data:image/jpeg;base64,aGV5', name: 'Bild 2', bytes: 3 }
    ])
  })
})

describe('promptKeyOf', () => {
  it('should join the trimmed texts after the image count', () => {
    expect(promptKeyOf(['  Fix this ', 'and that'], 2)).toBe('2|Fix this\nand that')
  })

  it('should tell apart the same text with another number of images', () => {
    expect(promptKeyOf(['ok'], 1)).not.toBe(promptKeyOf(['ok'], 2))
  })
})

describe('imageMeta', () => {
  it('should show dimensions and size', () => {
    expect(imageMeta(240 * 1024, 'de', { width: 1280, height: 720 })).toBe('1280 × 720 · 240 kB')
  })

  it('should show only the size while the dimensions are unknown', () => {
    expect(imageMeta(240 * 1024, 'de', null)).toBe('240 kB')
  })
})

describe('isGenericPasteName', () => {
  it('should flag the name every pasted screenshot gets', () => {
    expect([
      isGenericPasteName('image.png'),
      isGenericPasteName('Image.JPG'),
      isGenericPasteName('')
    ]).toEqual([true, true, true])
  })

  it('should keep a real file name', () => {
    expect(isGenericPasteName('image-of-header.png')).toBe(false)
  })
})

describe('clockStamp', () => {
  it('should write the time with dashes and leading zeros', () => {
    expect(clockStamp(new Date(2026, 10, 16, 9, 5, 7))).toBe('09-05-07')
  })
})

describe('extensionOf', () => {
  it('should map the image types and fall back to png', () => {
    expect([
      extensionOf('image/jpeg'),
      extensionOf('image/webp'),
      extensionOf('image/bmp')
    ]).toEqual(['jpg', 'webp', 'png'])
  })
})

describe('renameExtension', () => {
  it('should replace the extension', () => {
    expect(renameExtension('photo.final.jpg', 'image/png')).toBe('photo.final.png')
  })

  it('should add one to a name without', () => {
    expect(renameExtension('Bild 2', 'image/png')).toBe('Bild 2.png')
  })

  it('should keep a leading dot as part of the name', () => {
    expect(renameExtension('.hidden', 'image/png')).toBe('.hidden.png')
  })
})

describe('truncateName', () => {
  it('should cut a long name and mark the cut', () => {
    expect(truncateName('header-homeserver-final-v2.png', 16)).toBe('header-homeserve…')
  })

  it('should leave a short name alone', () => {
    expect(truncateName('logo.png', 16)).toBe('logo.png')
  })

  it('should not end the cut on a space', () => {
    expect(truncateName('my screen shot.png', 10)).toBe('my screen…')
  })
})

describe('prependLine', () => {
  it('should put the line before the draft with a blank line between', () => {
    expect(prependLine('Bitte fixen', 'Zu a.png: rot')).toBe('Zu a.png: rot\n\nBitte fixen')
  })

  it('should take the line alone when the draft is empty', () => {
    expect(prependLine('  ', 'Zu a.png: rot')).toBe('Zu a.png: rot')
  })
})

describe('placeMarked', () => {
  const images = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('should put the incoming images where the source was', () => {
    expect(placeMarked(images, 'b', [{ id: 'm' }, { id: 'b' }])).toEqual([
      { id: 'a' },
      { id: 'm' },
      { id: 'b' },
      { id: 'c' }
    ])
  })

  it('should append them when the source is gone or from the history', () => {
    expect(placeMarked(images, null, [{ id: 'm' }]).map((image) => image.id)).toEqual([
      'a',
      'b',
      'c',
      'm'
    ])
    expect(placeMarked(images, 'x', [{ id: 'm' }]).map((image) => image.id)).toEqual([
      'a',
      'b',
      'c',
      'm'
    ])
  })
})

describe('fileNameOf', () => {
  it('should swap an image extension for the one of the actual type', () => {
    expect(fileNameOf('shot.png', 'image/jpeg')).toBe('shot.jpg')
  })

  it('should keep a dot that is not an image extension', () => {
    expect(fileNameOf('v1.2 final', 'image/png')).toBe('v1.2 final.png')
  })

  it('should add the extension of the type to a bare name', () => {
    expect(fileNameOf('Bild 2', 'image/webp')).toBe('Bild 2.webp')
  })
})

describe('uniqueName', () => {
  it('should keep a free name', () => {
    expect(uniqueName('Bild 12-03-04.png', ['a.png'])).toBe('Bild 12-03-04.png')
  })

  it('should number a taken name before its extension', () => {
    expect(uniqueName('Bild 12-03-04.png', ['Bild 12-03-04.png', 'Bild 12-03-04 (2).png'])).toBe(
      'Bild 12-03-04 (3).png'
    )
  })
})
