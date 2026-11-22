/**
 * One entry of `permission_suggestions` in Claude's `can_use_tool` request, e.g. a rule to allow
 * `git push:*` from now on. Opaque to Bull: it goes back unchanged as `updatedPermissions`.
 */
export type PermissionUpdate = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The suggestions of a request, read defensively: anything that is not an object is dropped. */
export const suggestionsOf = (raw: unknown): PermissionUpdate[] =>
  Array.isArray(raw) ? raw.filter(isRecord) : []

// A prefix rule ends in ":*" ("git push:*"); the label names the command without it.
const PREFIX_WILDCARD = /:?\s*\*$/

/**
 * What "always allow" would allow, for the button label: the command of the first rule
 * ("git push"), else the tool of a rule without content ("WebFetch"); `null` when the suggestions
 * name no rule (e.g. only a directory), and the button then says just "always".
 */
export const alwaysTargetOf = (suggestions: PermissionUpdate[]): string | null => {
  const rule = suggestions
    .flatMap((update) =>
      update.type === 'addRules' && Array.isArray(update.rules) ? update.rules : []
    )
    .find(isRecord)
  if (!rule) return null
  if (typeof rule.ruleContent === 'string' && rule.ruleContent.trim())
    return rule.ruleContent.replace(PREFIX_WILDCARD, '').trim()
  return typeof rule.toolName === 'string' && rule.toolName ? rule.toolName : null
}

// The field that says what the call does, in this order; the rest only shows under "details".
// The pattern comes before the path: for Grep and Glob, what is searched matters more than where.
const LINE_FIELDS = ['command', 'file_path', 'notebook_path', 'url', 'pattern', 'query', 'path']
const DESCRIPTION_FIELD = 'description'

export interface ApprovalSummary {
  /** The command, file or address, whole: the user should see exactly what they allow. */
  line: string | null
  description: string | null
  /** Whether the input holds more than line and description (an edit's text, a timeout). */
  hasMore: boolean
}

export const approvalSummaryOf = (input: Record<string, unknown>): ApprovalSummary => {
  const field = LINE_FIELDS.find((name) => typeof input[name] === 'string' && input[name])
  const line = field ? input[field] : null
  const description = input[DESCRIPTION_FIELD]
  const shown = new Set([field, DESCRIPTION_FIELD])
  return {
    line: typeof line === 'string' ? line : null,
    description: typeof description === 'string' && description ? description : null,
    hasMore: Object.keys(input).some((key) => !shown.has(key))
  }
}

type ChoiceKeyEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'ctrlKey'
  | 'metaKey'
  | 'altKey'
  | 'repeat'
  | 'isComposing'
  | 'defaultPrevented'
  | 'target'
>

/** Marks the approval and question cards; every other alert dialog keeps its digits. */
export const CHOICE_CARD_ATTRIBUTE = 'data-choice-card'

/**
 * Where a digit is text or belongs to something else: fields (an option's radio button is no
 * field), dialogs, menus. A confirm dialog over the chat must never answer the card behind it.
 */
const OWNS_DIGITS = [
  'input:not([type="radio"]):not([type="checkbox"])',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="dialog"]',
  `[role="alertdialog"]:not([${CHOICE_CARD_ATTRIBUTE}])`,
  '[role="menu"]',
  '[role="listbox"]'
].join(', ')

/**
 * The choice a number key picks on an approval or question card, 0-based, like the numbered
 * options in Claude Code's terminal; `null` for any other key, out of range, or while typing.
 */
export const choiceKeyOf = (event: ChoiceKeyEvent, count: number): number | null => {
  if (event.defaultPrevented || event.isComposing || event.repeat) return null
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.target instanceof Element && event.target.closest(OWNS_DIGITS)) return null
  if (!/^[1-9]$/.test(event.key)) return null
  const index = Number(event.key) - 1
  return index < count ? index : null
}

/** The highest number key; a card shows no hint for a choice past it. */
export const MAX_CHOICE_KEY = 9

const QUESTION_TOOL = 'AskUserQuestion'
const PLAN_TOOL = 'ExitPlanMode'

type AskedTool = { toolName: string; input: Record<string, unknown> }

/** Which card answers an open approval. */
export type ApprovalKind = 'question' | 'plan' | 'tool'

/** The plan Claude wants to carry out, when the open approval is leaving plan mode; else `null`. */
export const planOf = (permission: AskedTool | null): string | null =>
  permission?.toolName === PLAN_TOOL && typeof permission.input.plan === 'string'
    ? permission.input.plan
    : null

export const approvalKindOf = (permission: AskedTool): ApprovalKind => {
  if (permission.toolName === QUESTION_TOOL) return 'question'
  return planOf(permission) === null ? 'tool' : 'plan'
}
