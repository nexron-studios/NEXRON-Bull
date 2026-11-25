import { describe, expect, it } from 'vitest'
import { noteBlockAfter, noteLinesAfter, withNoteLines, withoutNoteLines } from '../imageNotes'

const CHIP = '[Image 1 (shot.png)]'

describe('withNoteLines', () => {
  it('should put the notes on lines of their own under the chip, the rest of the text below', () => {
    const text = `${CHIP} please crop\nthanks`

    expect(withNoteLines(text, CHIP.length, ['① bigger', '② bluer'])).toBe(
      `${CHIP} please crop\n① bigger\n② bluer\nthanks`
    )
  })

  it('should add a later round after the notes already there', () => {
    const text = `${CHIP} \n① bigger\nthanks`

    expect(withNoteLines(text, CHIP.length, ['② bluer'])).toBe(
      `${CHIP} \n① bigger\n② bluer\nthanks`
    )
  })
})

describe('withoutNoteLines', () => {
  it('should take the note lines under the chip and keep the text after them', () => {
    expect(withoutNoteLines(`${CHIP} crop\n① bigger\n(21) far\nthanks`, CHIP.length)).toBe(
      `${CHIP} crop\nthanks`
    )
  })

  it('should leave a text without notes under the chip as it is', () => {
    expect(withoutNoteLines(`${CHIP} crop\nthanks ①`, CHIP.length)).toBe(`${CHIP} crop\nthanks ①`)
  })
})

describe('noteLinesAfter', () => {
  it('should read the note lines under the chip', () => {
    expect(noteLinesAfter(`${CHIP} crop\n① bigger\n② bluer\nthanks`, CHIP.length)).toEqual([
      '① bigger',
      '② bluer'
    ])
  })
})

describe('noteBlockAfter', () => {
  it('should find nothing on the last line', () => {
    expect(noteBlockAfter(CHIP, 3)).toBeNull()
  })
})
