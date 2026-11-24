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

/** The choices of one question after a click on `label`: several toggle, a single one replaces. */
export const toggledChoice = (current: string[], label: string, isMulti: boolean): string[] => {
  if (!isMulti) return [label]
  return current.includes(label) ? current.filter((l) => l !== label) : [...current, label]
}

/** The choices once the user turns to the own answer: it replaces a single choice, adds to several. */
export const withOtherChoice = (current: string[], isMulti: boolean): string[] => {
  if (!isMulti) return [OTHER_CHOICE]
  return current.includes(OTHER_CHOICE) ? current : [...current, OTHER_CHOICE]
}
