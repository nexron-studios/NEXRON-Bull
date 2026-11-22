import { describe, expect, it } from 'vitest'
import { answersOf, questionsOf, toggledChoice } from '../questions'

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
  it('should join multiple choices and prefer free text', () => {
    const questions = questionsOf(input)
    const answers = answersOf(
      questions,
      { 'Rot oder Blau?': ['Blau'], 'Welche Sprachen?': ['de', 'en'] },
      { 'Rot oder Blau?': '  Grün  ' }
    )
    expect(answers).toEqual({ 'Rot oder Blau?': 'Grün', 'Welche Sprachen?': 'de, en' })
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
