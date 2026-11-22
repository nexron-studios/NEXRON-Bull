/** What the text right before the caret asks the composer to suggest. */
export const triggerKindList = ['slash', 'mention'] as const
export type TriggerKind = (typeof triggerKindList)[number]

export interface Trigger {
  kind: TriggerKind
  /** What was typed after `/` or `@` */
  query: string
  /** Where the `/` or `@` stands */
  start: number
  /** The caret: the end of what a pick replaces */
  end: number
}

const WHITESPACE = /\s/
/** What a command name may hold; `/etc/hosts` is a path, not a command being typed. */
const COMMAND_QUERY = /^[\w:.-]*$/

/**
 * `/` opens the command menu only at the very start, while the command name is typed. `@` opens
 * the file menu after a space or at the start, until the next space.
 */
export const triggerAt = (text: string, caret: number): Trigger | null => {
  const before = text.slice(0, caret)
  if (before.startsWith('/') && COMMAND_QUERY.test(before.slice(1)))
    return { kind: 'slash', query: before.slice(1), start: 0, end: caret }
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  const query = before.slice(at + 1)
  if (WHITESPACE.test(query)) return null
  if (at > 0 && !WHITESPACE.test(before.charAt(at - 1))) return null
  return { kind: 'mention', query, start: at, end: caret }
}

export interface Replaced {
  text: string
  caret: number
}

/** The text with `insert` in place of what the trigger covers, and the caret right after it. */
export const replaceTrigger = (text: string, trigger: Trigger, insert: string): Replaced => {
  const rest = text.slice(trigger.end)
  // A pick already followed by a space must not get a second one.
  const glue = insert.endsWith(' ') && rest.startsWith(' ') ? insert.trimEnd() : insert
  return { text: text.slice(0, trigger.start) + glue + rest, caret: trigger.start + glue.length }
}
