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

/** One answer string per question, as AskUserQuestion expects in `answers`; free text wins. */
export const answersOf = (
  questions: Question[],
  chosen: Record<string, string[]>,
  other: Record<string, string>
): Record<string, string> =>
  Object.fromEntries(
    questions.map((q) => [
      q.question,
      other[q.question]?.trim() || (chosen[q.question] ?? []).join(', ')
    ])
  )

/** The choices of one question after a click on `label`: several toggle, a single one replaces. */
export const toggledChoice = (current: string[], label: string, isMulti: boolean): string[] => {
  if (!isMulti) return [label]
  return current.includes(label) ? current.filter((l) => l !== label) : [...current, label]
}
