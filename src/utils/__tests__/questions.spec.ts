import { describe, expect, it } from 'vitest'
import { OTHER_CHOICE, answersOf, questionsOf, toggledChoice, withOtherChoice } from '../questions'

const input = {
  questions: [
    {
      question: 'Rot oder Blau?',
      header: 'Farbe',
      multiSelect: false,
      options: [{ label: 'Rot', description: 'warm' }, { label: 'Blau' }]
    },
    { question: 'Welche Sprachen?', multiSelect: true, options: [{ label: 'de' }, { label: 'en' }] }
  ]
}

describe('questionsOf', () => {
  it('should read questions and fill missing descriptions with empty text', () => {
    expect(questionsOf(input)[0]).toEqual({
      question: 'Rot oder Blau?',
      multiSelect: false,
      options: [
        { label: 'Rot', description: 'warm' },
        { label: 'Blau', description: '' }
      ]
    })
  })

  it('should return no questions for malformed input', () => {
    expect(questionsOf({ questions: 'nope' })).toEqual([])
  })
})

describe('answersOf', () => {
  it('should send the chosen own answer alone and add it to several choices', () => {
    const answers = answersOf(
      questionsOf(input),
      { 'Rot oder Blau?': [OTHER_CHOICE], 'Welche Sprachen?': ['de', 'en', OTHER_CHOICE] },
      { 'Rot oder Blau?': '  Grün  ', 'Welche Sprachen?': 'fr' }
    )
    expect(answers).toEqual({ 'Rot oder Blau?': 'Grün', 'Welche Sprachen?': 'de, en, fr' })
  })

  it('should ignore typed text that is not chosen and answer nothing for an empty own answer', () => {
    const answers = answersOf(
      questionsOf(input),
      { 'Rot oder Blau?': ['Blau'], 'Welche Sprachen?': [OTHER_CHOICE] },
      { 'Rot oder Blau?': 'Grün', 'Welche Sprachen?': '  ' }
    )
    expect(answers).toEqual({ 'Rot oder Blau?': 'Blau', 'Welche Sprachen?': '' })
  })
})

describe('withOtherChoice', () => {
  it('should replace a single choice and add to several once', () => {
    expect([
      withOtherChoice(['Rot'], false),
      withOtherChoice(['de'], true),
      withOtherChoice(['de', OTHER_CHOICE], true)
    ]).toEqual([[OTHER_CHOICE], ['de', OTHER_CHOICE], ['de', OTHER_CHOICE]])
  })
})

describe('toggledChoice', () => {
  it('should replace a single choice', () => {
    expect(toggledChoice(['Rot'], 'Blau', false)).toEqual(['Blau'])
  })

  it('should add and remove choices of a multi-select question', () => {
    expect([toggledChoice(['de'], 'en', true), toggledChoice(['de', 'en'], 'de', true)]).toEqual([
      ['de', 'en'],
      ['en']
    ])
  })
})
