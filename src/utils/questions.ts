/** The input of Claude's AskUserQuestion tool, read defensively: it comes from the model. */
export interface Question {
  question: string
  multiSelect: boolean
  options: { label: string; description: string }[]
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

export const questionsOf = (input: Record<string, unknown>): Question[] => {
  const list = Array.isArray(input.questions) ? input.questions : []
  return list.map((raw: Record<string, unknown>) => ({
    question: asString(raw.question),
    multiSelect: raw.multiSelect === true,
    options: (Array.isArray(raw.options) ? raw.options : []).map((o: Record<string, unknown>) => ({
      label: asString(o.label),
      description: asString(o.description)
    }))
  }))
}

/**
 * The own answer as a choice, like Claude Code's "Other". The NUL keeps it apart from any label
 * the model could write.
 */
export const OTHER_CHOICE = '\u0000other'

/**
 * One answer string per question, as AskUserQuestion expects in `answers`. Single choice: the
 * option or the own answer, whichever was chosen last. Several: the checked options plus the own
 * answer, joined like Claude Code does.
 */
export const answersOf = (
  questions: Question[],
  chosen: Record<string, string[]>,
  other: Record<string, string>
): Record<string, string> =>
  Object.fromEntries(
    questions.map((q) => {
      const picks = chosen[q.question] ?? []
      const labels = picks.filter((pick) => pick !== OTHER_CHOICE)
      const own = picks.includes(OTHER_CHOICE) ? (other[q.question]?.trim() ?? '') : ''
      return [q.question, [...labels, own].filter(Boolean).join(', ')]
    })
  )

/**
 * The choices of one question after a click on `label`: a chosen one is unchosen, otherwise a
 * single choice replaces and several add.
 */
export const toggledChoice = (current: string[], label: string, isMulti: boolean): string[] => {
  if (current.includes(label)) return current.filter((l) => l !== label)
  return isMulti ? [...current, label] : [label]
}

/**
 * The choices once the own answer reads `text`: text chooses it (replacing a single choice, adding
 * to several), an emptied field unchooses it.
 */
export const withOwnAnswer = (current: string[], text: string, isMulti: boolean): string[] => {
  if (!text.trim()) return current.filter((choice) => choice !== OTHER_CHOICE)
  if (!isMulti) return [OTHER_CHOICE]
  return current.includes(OTHER_CHOICE) ? current : [...current, OTHER_CHOICE]
}
