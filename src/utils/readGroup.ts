import type { ReadStep } from '@/utils/chatStream'
import { readCategoryList, readCategoryOf, type ReadCategory } from '@/utils/toolKind'
import type { ToolResultBlock } from '@/utils/toolPairs'

/** How many calls of each kind a folded run holds, in the order the line names them. */
export const readCountsOf = (steps: ReadStep[]): [ReadCategory, number][] =>
  readCategoryList
    .map((category): [ReadCategory, number] => [
      category,
      steps.filter((step) => step.kind === 'tool' && readCategoryOf(step.block.name) === category)
        .length
    ])
    .filter(([, count]) => count > 0)

export const readStateList = ['running', 'done', 'failed', 'stopped'] as const
export type ReadState = (typeof readStateList)[number]

/** One mark for the whole run: still reading, something failed, done, or cut off. */
export const readStateOf = (
  steps: ReadStep[],
  results: Map<string, ToolResultBlock>,
  isRunning: boolean
): ReadState => {
  const calls = steps.flatMap((step) => (step.kind === 'tool' ? [step.block] : []))
  if (calls.some((call) => !results.has(call.id))) return isRunning ? 'running' : 'stopped'
  return calls.some((call) => results.get(call.id)?.is_error) ? 'failed' : 'done'
}
