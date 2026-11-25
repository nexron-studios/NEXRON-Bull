import { describe, expect, it } from 'vitest'
import type { PendingImage } from '@/utils/content'
import { noteTextOf, type MarkNote } from '@/utils/markup'
import { withImageNotes } from '../imageNotes'

const imageOf = (name: string, notes?: MarkNote[]): PendingImage => ({
  id: name,
  name,
  mediaType: 'image/png',
  data: 'QUJD',
  src: 'data:image/png;base64,QUJD',
  bytes: 3,
  notes
})

const lineOf = (n: number, image: PendingImage, notes: readonly MarkNote[]) =>
  `Zu [Bild ${n} (${image.name})]: ${notes.map(noteTextOf).join(' ')}`

describe('withImageNotes', () => {
  it('should put a line per image with notes in front, numbered by its place', () => {
    const images = [
      imageOf('a.png', [{ number: 1, text: 'bigger' }]),
      imageOf('b.png'),
      imageOf('c.png', [{ number: 1, text: 'x' }])
    ]

    expect(withImageNotes('please crop', images, lineOf)).toBe(
      'Zu [Bild 1 (a.png)]: ① bigger\nZu [Bild 3 (c.png)]: ① x\n\nplease crop'
    )
  })

  it('should leave a text alone whose images have no notes', () => {
    expect(withImageNotes('please crop', [imageOf('a.png', [])], lineOf)).toBe('please crop')
  })

  it('should send the notes alone when nothing was typed', () => {
    expect(withImageNotes('', [imageOf('a.png', [{ number: 1, text: 'bigger' }])], lineOf)).toBe(
      'Zu [Bild 1 (a.png)]: ① bigger'
    )
  })
})
