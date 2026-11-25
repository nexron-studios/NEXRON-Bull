import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ChatQuestionCard from '../ChatQuestionCard.vue'
import i18n from '@/i18n'

const QUESTION = 'Ist der fertig?'
const SPRACHEN = 'Welche Sprachen?'

const permissionOf = (multiSelect: boolean) => ({
  requestId: 'r1',
  toolName: 'AskUserQuestion',
  suggestions: [],
  input: {
    questions: [
      {
        question: multiSelect ? SPRACHEN : QUESTION,
        multiSelect,
        options: [{ label: 'Ja' }, { label: 'Läuft noch' }, { label: 'Windows machen' }]
      }
    ]
  }
})

const mountCard = (multiSelect = false) =>
  mount(ChatQuestionCard, {
    props: { permission: permissionOf(multiSelect), isKeyed: false },
    global: { plugins: [i18n] },
    attachTo: document.body
  })

type Card = ReturnType<typeof mountCard>

const optionInputs = (wrapper: Card) =>
  wrapper
    .findAll('input')
    .filter((input) => ['radio', 'checkbox'].includes(input.attributes('type') ?? ''))
const optionRows = (wrapper: Card) => wrapper.findAll('label')
const otherField = (wrapper: Card) => wrapper.find('input:not([type])')
const checkedOf = (wrapper: Card) =>
  optionInputs(wrapper).map((input) => (input.element as HTMLInputElement).checked)
const submit = (wrapper: Card) => wrapper.find('form').trigger('submit')
const sentAnswer = (wrapper: Card) => wrapper.emitted('answer')?.at(-1)?.[0]

describe('ChatQuestionCard', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'de'
  })

  it('should take the own answer alone once it is typed after picking an option', async () => {
    const wrapper = mountCard()
    await optionInputs(wrapper)[2].trigger('click')

    await otherField(wrapper).trigger('focus')
    await otherField(wrapper).setValue('Mach du es')
    await submit(wrapper)

    expect([checkedOf(wrapper), sentAnswer(wrapper)]).toEqual([
      [false, false, false],
      { [QUESTION]: 'Mach du es' }
    ])
  })

  it('should send the option picked after typing, not the typed text', async () => {
    const wrapper = mountCard()
    await otherField(wrapper).setValue('Mach du es')

    await optionInputs(wrapper)[1].trigger('click')
    await submit(wrapper)

    expect(sentAnswer(wrapper)).toEqual({ [QUESTION]: 'Läuft noch' })
  })

  it('should keep the picked option when focus only passes through the empty own answer', async () => {
    const wrapper = mountCard()
    await optionInputs(wrapper)[1].trigger('click')

    await otherField(wrapper).trigger('focus')
    await submit(wrapper)

    expect(sentAnswer(wrapper)).toEqual({ [QUESTION]: 'Läuft noch' })
  })

  it('should keep the picked option when the own answer is only blanks', async () => {
    const wrapper = mountCard()
    await optionInputs(wrapper)[0].trigger('click')

    await otherField(wrapper).setValue('   ')
    await submit(wrapper)

    expect(sentAnswer(wrapper)).toEqual({ [QUESTION]: 'Ja' })
  })

  it('should add the own answer to the checked options of a multi-select question', async () => {
    const wrapper = mountCard(true)
    await optionInputs(wrapper)[0].trigger('click')
    await optionInputs(wrapper)[2].trigger('click')

    await otherField(wrapper).setValue('Französisch')
    await submit(wrapper)

    expect(sentAnswer(wrapper)).toEqual({ [SPRACHEN]: 'Ja, Windows machen, Französisch' })
  })

  it('should unchoose a single option whose row is clicked again', async () => {
    const wrapper = mountCard()
    await optionRows(wrapper)[1].trigger('click')

    await optionRows(wrapper)[1].trigger('click')
    await submit(wrapper)

    expect([checkedOf(wrapper), wrapper.emitted('answer')]).toEqual([
      [false, false, false],
      undefined
    ])
  })

  it('should keep a single option when its focused radio is pressed again', async () => {
    const wrapper = mountCard()
    await optionRows(wrapper)[1].trigger('click')

    await optionInputs(wrapper)[1].trigger('click')
    await submit(wrapper)

    expect(sentAnswer(wrapper)).toEqual({ [QUESTION]: 'Läuft noch' })
  })

  it('should unchoose the own answer once its text is cleared', async () => {
    const wrapper = mountCard(true)
    await optionInputs(wrapper)[0].trigger('click')
    await otherField(wrapper).setValue('Französisch')

    await otherField(wrapper).setValue('')
    await submit(wrapper)

    expect(sentAnswer(wrapper)).toEqual({ [SPRACHEN]: 'Ja' })
  })
})
