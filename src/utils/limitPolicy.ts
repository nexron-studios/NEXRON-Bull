import type { FolderRuleProps, LimitMode, LimitPolicy } from '@/types/agentd.type'
import type { AccountCardProps } from '@/utils/accountCards'
import { folderNameOf } from '@/utils/sessionList'

/**
 * Decided by the owner: folders without a rule may move to any account, so the policy starts with
 * no rules and an order that is only the accounts' names until the user arranges them.
 */
export const DEFAULT_LIMIT_POLICY: LimitPolicy = {
  mode: 'auto',
  suggest_early: true,
  order: [],
  rules: [],
  queue: true
}

/** One account the policy can name: a label, the same folder name on every machine. */
export interface LimitAccount {
  label: string
  /** `accountKeyOf` of its first offered profile, for its colour */
  accountKey: string
  /** `Max`, `Pro`; `null` until a quota answered */
  plan: string | null
}

/**
 * The accounts Bull offers on any machine, one per label: `office` here and on a server is one
 * entry, because agentd matches rules and order by label. The first machine that offers a label
 * gives it its colour and plan. An account switched off everywhere is left out, and so is a second
 * profile on a login already listed (`default` and `gmail` both signed in as one account): it
 * shares that quota, so moving there never helps.
 */
export const limitAccountsOf = (groups: { cards: AccountCardProps[] }[]): LimitAccount[] => {
  const byLabel = new Map<string, LimitAccount>()
  const listedLogins = new Set<string>()
  for (const card of groups.flatMap((group) => group.cards)) {
    if (!card.isOffered || byLabel.has(card.profile.label)) continue
    if (card.profile.email && listedLogins.has(card.profile.email)) continue
    if (card.profile.email) listedLogins.add(card.profile.email)
    byLabel.set(card.profile.label, {
      label: card.profile.label,
      accountKey: card.accountKey,
      plan: card.plan
    })
  }
  return [...byLabel.values()]
}

/**
 * The colour key of a label in a rule: its account's, or for a label no machine offers right now
 * (offline, switched off) one from the label alone, so it still gets a steady colour.
 */
export const accountKeyOfLabel = (accounts: LimitAccount[], label: string): string =>
  accounts.find((account) => account.label === label)?.accountKey ?? `:${label}`

/** The accounts in the order a full chat tries them: as arranged, the others after by name. */
export const orderedAccountsOf = (accounts: LimitAccount[], order: string[]): LimitAccount[] => {
  const position = new Map(order.map((label, index) => [label, index]))
  const placed = accounts
    .filter((account) => position.has(account.label))
    .sort((a, b) => (position.get(a.label) ?? 0) - (position.get(b.label) ?? 0))
  const unplaced = accounts
    .filter((account) => !position.has(account.label))
    .sort((a, b) => a.label.localeCompare(b.label))
  return [...placed, ...unplaced]
}

/**
 * The stored order after the user arranged the shown accounts: those first, then labels of
 * accounts that are offline or switched off right now, so they keep their place for later.
 */
export const withShownOrder = (order: string[], shown: string[]): string[] => [
  ...shown,
  ...order.filter((label) => !shown.includes(label))
]

/** What a folder's chat does once its account is full and the others it may use are too. */
export const ruleFallbackList = ['move_or_wait', 'ask_or_wait', 'wait'] as const
export type RuleFallback = (typeof ruleFallbackList)[number]

/** One allowed account leaves nowhere to move; "Nur warten" never moves at all. */
export const ruleFallbackOf = (accountCount: number, mode: LimitMode): RuleFallback => {
  if (accountCount < 2) return 'wait'
  switch (mode) {
    case 'auto':
      return 'move_or_wait'
    case 'ask':
      return 'ask_or_wait'
    case 'wait':
      return 'wait'
    default: {
      const unhandled: never = mode
      throw new Error(`Unhandled limit mode: ${unhandled}`)
    }
  }
}

/** agentd compares folder names case-insensitively, so `Kramlos` and `kramlos` are one rule. */
const folderKeyOf = (folder: string): string => folder.trim().toLowerCase()

export const ruleProblemList = ['empty', 'no_account', 'taken'] as const
export type RuleProblem = (typeof ruleProblemList)[number]

/**
 * Why a rule cannot be saved; `null` when it can. `editing` is the folder of the rule being
 * changed, which may keep its own name.
 */
export const ruleProblemOf = (
  rule: FolderRuleProps,
  rules: FolderRuleProps[],
  editing: string | null
): RuleProblem | null => {
  const key = folderKeyOf(rule.folder)
  if (!key) return 'empty'
  if (!rule.accounts.length) return 'no_account'
  const isTaken = rules.some(
    (other) =>
      folderKeyOf(other.folder) === key &&
      (editing === null || folderKeyOf(other.folder) !== folderKeyOf(editing))
  )
  return isTaken ? 'taken' : null
}

/** Adds a rule, or replaces the one for `editing` in its place. */
export const withRule = (
  rules: FolderRuleProps[],
  rule: FolderRuleProps,
  editing: string | null
): FolderRuleProps[] => {
  const saved = { folder: rule.folder.trim(), accounts: [...rule.accounts] }
  const at = editing === null ? -1 : rules.findIndex((other) => other.folder === editing)
  if (at < 0) return [...rules, saved]
  return rules.map((other, index) => (index === at ? saved : other))
}

export const withoutRule = (rules: FolderRuleProps[], folder: string): FolderRuleProps[] =>
  rules.filter((rule) => rule.folder !== folder)

const WORKTREE_FOLDER_NAMES = ['worktrees', '.worktrees']
const SCRATCH_FOLDER_NAMES = ['temp', 'tmp']
/** A folder a tool generated per job; nobody names a project like that. */
const GENERATED_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Folder names to offer for a new rule, from the working folders of recent sessions. A worktree
 * is left out: agentd matches it under its main repository, so its own name would never apply.
 * So is anything under a temp folder or named by a UUID (scratch and job folders are no
 * projects), and every folder that already has a rule.
 */
export const folderSuggestionsOf = (cwds: string[], rules: FolderRuleProps[]): string[] => {
  const ruled = new Set(rules.map((rule) => folderKeyOf(rule.folder)))
  const names = cwds
    .filter((cwd) => {
      const parents = cwd.toLowerCase().split(/[\\/]/).filter(Boolean).slice(0, -1)
      const isWorktree = WORKTREE_FOLDER_NAMES.includes(parents.at(-1) ?? '')
      return !isWorktree && !parents.some((part) => SCRATCH_FOLDER_NAMES.includes(part))
    })
    .map(folderNameOf)
    .filter((name) => !GENERATED_NAME_PATTERN.test(name) && !ruled.has(folderKeyOf(name)))
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}
