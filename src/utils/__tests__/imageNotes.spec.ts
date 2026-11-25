import { describe, expect, it } from 'vitest'
import {
  NOTE_LINE_SLOTS,
  noteLineFormatOf,
  notesOfImage,
  remapNoteLines,
  withImageNotes
} from '../imageNotes'

const FORMAT = noteLineFormatOf(`Bild ${NOTE_LINE_SLOTS.n}: ${NOTE_LINE_SLOTS.note}`)
const one = { id: 'a', name: 'a.png' }
const two = { id: 'b', name: 'b.png' }
// Two chips on one line, as the draft holds them (their text does not matter here).
const LINE = '[Bild 1] [Bild 2] compare them'
const SECOND_CHIP_END = '[Bild 1] [Bild 2]'.length

describe('noteLineFormatOf', () => {
  it('should read back what it writes, and nothing else', () => {
    expect(FORMAT.render(2, '① smaller')).toBe('Bild 2: ① smaller')
    expect(FORMAT.parse('Bild 12: (21) far off')).toEqual({ n: 12, note: '(21) far off' })
    expect([FORMAT.parse('Bild 2: smaller'), FORMAT.parse('① smaller')]).toEqual([null, null])
  })
})

describe('withImageNotes', () => {
  it('should put the notes on lines of their own under the chip, the rest of the text below', () => {
    expect(withImageNotes(`${LINE}\nthanks`, 8, 1, ['① bigger', '② bluer'], FORMAT)).toBe(
      `${LINE}\nBild 1: ① bigger\nBild 1: ② bluer\nthanks`
    )
  })

  it('should keep image 1 above image 2 when image 2 was marked first', () => {
    const second = withImageNotes(LINE, SECOND_CHIP_END, 2, ['① smaller'], FORMAT)

    expect(withImageNotes(second, 8, 1, ['① bigger'], FORMAT)).toBe(
      `${LINE}\nBild 1: ① bigger\nBild 2: ① smaller`
    )
  })

  it('should add a later round of an image after its earlier notes', () => {
    const text = `${LINE}\nBild 1: ① bigger\nBild 2: ① smaller`

    expect(withImageNotes(text, 8, 1, ['② bluer'], FORMAT)).toBe(
      `${LINE}\nBild 1: ① bigger\nBild 1: ② bluer\nBild 2: ① smaller`
    )
  })
})

describe('remapNoteLines', () => {
  const text = `${LINE}\nBild 1: ① bigger\nBild 2: ① smaller\nthanks`

  it('should take only the notes of a removed image and renumber the rest', () => {
    expect(remapNoteLines(text, [one, two], [two], FORMAT)).toBe(
      `${LINE}\nBild 1: ① smaller\nthanks`
    )
  })

  it('should keep the notes of an image a marked copy took the place of', () => {
    const marked = { id: 'm', name: 'a.png' }

    expect(remapNoteLines(text, [one, two], [marked, two], FORMAT, { a: 'm' })).toBe(text)
  })

  it('should leave a line alone that names no attachment', () => {
    expect(remapNoteLines('Bild 3: ① stale', [one, two], [two], FORMAT)).toBe('Bild 3: ① stale')
  })
})

describe('notesOfImage', () => {
  it('should read the notes of one image among others', () => {
    const text = `${LINE}\nBild 1: ① bigger\nBild 2: ① smaller\nBild 1: ② bluer`

    expect(notesOfImage(text, 1, FORMAT)).toEqual(['① bigger', '② bluer'])
  })
})
