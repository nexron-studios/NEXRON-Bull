import type { SlashCommandProps } from '@/types/agentd.type'

/**
 * Commands Bull lists first, in this order. Each one shows only while the app handles it or
 * Claude Code lists it (then Claude runs it from the prompt).
 */
export const bullCommandList = ['compact', 'context', 'model', 'rewind', 'clear', 'export'] as const
export type BullCommand = (typeof bullCommandList)[number]

export const commandGroupList = ['bull', 'claude', 'custom'] as const
export type CommandGroup = (typeof commandGroupList)[number]

export interface MenuCommand {
  name: string
  description: string
  argumentHint: string
  group: CommandGroup
  /** Where a custom command or skill comes from: `user`, `project`, a plugin name, … */
  source: string | null
}

/** "Commit staged changes (user)": Claude Code names a custom entry's origin at the end. */
const SOURCE_SUFFIX = /\s*\(([^()]+)\)\s*$/
/** Origins Claude Code writes that mean "not shipped with Claude Code". */
const CUSTOM_SOURCES = new Set(['user', 'project', 'claude.ai sync', 'dynamic workflow'])
/** Internal entries of server-launched sessions, never typed by anyone. */
const INTERNAL_PREFIX = '_'

const isBullCommand = (name: string): name is BullCommand =>
  (bullCommandList as readonly string[]).includes(name)

/** A plugin's entries carry its name in front (`engineering:debug`). */
const pluginOf = (name: string): string | null =>
  name.includes(':') ? name.slice(0, name.indexOf(':')) : null

const menuCommandOf = (command: SlashCommandProps): MenuCommand => {
  const suffix = SOURCE_SUFFIX.exec(command.description)?.[1] ?? null
  const plugin = pluginOf(command.name)
  const isCustom = plugin !== null || (suffix !== null && CUSTOM_SOURCES.has(suffix))
  const description =
    isCustom && suffix ? command.description.replace(SOURCE_SUFFIX, '') : command.description
  return {
    name: command.name,
    description,
    argumentHint: command.argument_hint,
    group: isCustom ? 'custom' : 'claude',
    source: isCustom ? (plugin ?? suffix) : null
  }
}

/**
 * The whole menu: Bull's own commands (the app handles them or Claude lists them), then what
 * Claude Code ships, then custom commands and skills. `bullDescriptions` are the app's texts.
 */
export const menuCommandsOf = (
  claude: readonly SlashCommandProps[],
  handled: ReadonlySet<string>,
  bullDescriptions: Record<BullCommand, string>
): MenuCommand[] => {
  const listed = new Map(claude.map((command) => [command.name, command]))
  const bull = bullCommandList
    .filter((name) => handled.has(name) || listed.has(name))
    .map((name): MenuCommand => ({
      name,
      description: bullDescriptions[name],
      argumentHint: listed.get(name)?.argument_hint ?? '',
      group: 'bull',
      source: null
    }))
  const rest = claude
    .filter((command) => !isBullCommand(command.name) && !command.name.startsWith(INTERNAL_PREFIX))
    .map(menuCommandOf)
  return [
    ...bull,
    ...rest.filter((command) => command.group === 'claude'),
    ...rest.filter((command) => command.group === 'custom')
  ]
}

export interface SlashInput {
  name: string
  args: string
}

const SLASH_INPUT = /^\/([\w:.-]+)(?:\s+([\s\S]*))?$/

/** `/compact keep the API notes` → name and arguments; `null` for anything else. */
export const parseSlashInput = (text: string): SlashInput | null => {
  const match = SLASH_INPUT.exec(text.trim())
  if (!match?.[1]) return null
  return { name: match[1], args: (match[2] ?? '').trim() }
}
