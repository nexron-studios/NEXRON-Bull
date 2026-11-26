/**
 * What a tool does, as the colour hierarchy in tokens.css sees it. `skill`: Claude follows a skill
 * (code-review, a house skill …), tinted in the skills orange so it stands out from plain steps.
 */
export const toolKindList = ['read', 'change', 'outside', 'skill'] as const
export type ToolKind = (typeof toolKindList)[number]

/** What the thinking bar says Claude is doing while a call runs; the key under `chat.stream.activity`. */
export const activityList = [
  'reads',
  'searches',
  'edits',
  'runs',
  'fetches',
  'searches_web',
  'delegates',
  'plans',
  'applies_skill',
  'uses'
] as const
export type Activity = (typeof activityList)[number]

/** The picture on a tool card; ChatToolCall maps each one to a Lucide icon. */
export const toolIconList = [
  'file',
  'folder',
  'search',
  'edit',
  'terminal',
  'web',
  'agent',
  'tasks',
  'plug',
  'wrench',
  'skill',
  'review',
  'security',
  'simplify',
  'play',
  'loop',
  'schedule',
  'init',
  'config'
] as const
export type ToolIcon = (typeof toolIconList)[number]

/** Skills that ship with Claude Code or run often here; any other skill gets the generic `skill`. */
export const knownSkillList = [
  'code-review',
  'review',
  'thermo-nuclear-review',
  'security-review',
  'simplify',
  'run',
  'loop',
  'schedule',
  'init',
  'update-config'
] as const
export type KnownSkill = (typeof knownSkillList)[number]

const SKILL_ICON: Record<KnownSkill, ToolIcon> = {
  'code-review': 'review',
  review: 'review',
  'thermo-nuclear-review': 'review',
  'security-review': 'security',
  simplify: 'simplify',
  run: 'play',
  loop: 'loop',
  schedule: 'schedule',
  init: 'init',
  'update-config': 'config'
}

const isKnownSkill = (skill: string): skill is KnownSkill =>
  (knownSkillList as readonly string[]).includes(skill)

// Plugin skills come as `plugin:skill` and a typed command as `/skill`; the bare name decides.
// Only the icon looks at the bare name; the text keeps `plugin:skill`, which tells two plugins'
// skills of the same name apart.
const bareSkillOf = (skill: string): string => skill.replace(/^\//, '').split(':').at(-1) ?? ''

/** The picture of one skill: its own for a well-known one, the generic skill icon otherwise. */
export const skillIconOf = (skill: string): ToolIcon => {
  const bare = bareSkillOf(skill)
  return isKnownSkill(bare) ? SKILL_ICON[bare] : 'skill'
}

export interface ToolInfo {
  kind: ToolKind
  activity: Activity
  icon: ToolIcon
}

const READS_FILE: ToolInfo = { kind: 'read', activity: 'reads', icon: 'file' }
const SEARCHES: ToolInfo = { kind: 'read', activity: 'searches', icon: 'search' }
const EDITS: ToolInfo = { kind: 'change', activity: 'edits', icon: 'edit' }
const RUNS: ToolInfo = { kind: 'outside', activity: 'runs', icon: 'terminal' }
const DELEGATES: ToolInfo = { kind: 'outside', activity: 'delegates', icon: 'agent' }
// Claude's plan changes, the project does not: planning reads as change, looking it up as read.
const PLANS: ToolInfo = { kind: 'change', activity: 'plans', icon: 'tasks' }
const READS_PLAN: ToolInfo = { kind: 'read', activity: 'plans', icon: 'tasks' }

/** Every tool Bull knows by name; the single source for colour, activity and icon. */
const TOOLS: Record<string, ToolInfo> = {
  Read: READS_FILE,
  NotebookRead: READS_FILE,
  LS: { kind: 'read', activity: 'reads', icon: 'folder' },
  Grep: SEARCHES,
  Glob: SEARCHES,
  ToolSearch: SEARCHES,
  Edit: EDITS,
  MultiEdit: EDITS,
  Write: EDITS,
  NotebookEdit: EDITS,
  Bash: RUNS,
  PowerShell: RUNS,
  WebFetch: { kind: 'outside', activity: 'fetches', icon: 'web' },
  WebSearch: { kind: 'outside', activity: 'searches_web', icon: 'web' },
  Task: DELEGATES,
  Agent: DELEGATES,
  TodoWrite: PLANS,
  TaskCreate: PLANS,
  TaskUpdate: PLANS,
  TaskList: READS_PLAN,
  TaskGet: READS_PLAN
}
const SKILL_TOOL = 'Skill'

export const isSkillTool = (name: string): boolean => name === SKILL_TOOL
const MCP_PREFIX = 'mcp__'
const MCP_TOOL: ToolInfo = { kind: 'outside', activity: 'uses', icon: 'plug' }
const UNKNOWN_TOOL: ToolInfo = { kind: 'outside', activity: 'uses', icon: 'wrench' }

/**
 * Unknown tools run outside the project, like shell, web, MCP and subagents. `target` is the call's
 * summary (`summarizeToolInput`): for a Skill call it names the skill, which picks the icon.
 */
export const toolInfoOf = (name: string, target = ''): ToolInfo => {
  if (isSkillTool(name))
    return { kind: 'skill', activity: 'applies_skill', icon: skillIconOf(target) }
  return TOOLS[name] ?? (name.startsWith(MCP_PREFIX) ? MCP_TOOL : UNKNOWN_TOOL)
}

/** The tools Claude keeps its plan with; they feed the steps list, not the chain. */
export const isTaskTool = (name: string): boolean => toolInfoOf(name).activity === 'plans'

const PATH_SEPARATOR = /[\\/]/

/** A file path shortened to its name; other targets stay as they are. */
export const shortTarget = (target: string): string =>
  PATH_SEPARATOR.test(target) && !target.includes(' ')
    ? (target.split(PATH_SEPARATOR).filter(Boolean).at(-1) ?? target)
    : target

const PATH_TAIL_SEGMENTS = 3

/** A long file path cut to its last folders, so the file name stays visible in a tool card. */
export const compactPath = (target: string): string => {
  if (!PATH_SEPARATOR.test(target) || target.includes(' ')) return target
  const separator = target.includes('\\') ? '\\' : '/'
  const segments = target.split(PATH_SEPARATOR).filter(Boolean)
  if (segments.length <= PATH_TAIL_SEGMENTS) return target
  return `…${separator}${segments.slice(-PATH_TAIL_SEGMENTS).join(separator)}`
}

/** What a read-only call looked at; consecutive ones fold into one line in the chat. */
export const readCategoryList = ['file', 'folder', 'search'] as const
export type ReadCategory = (typeof readCategoryList)[number]

const READ_CATEGORY: Record<string, ReadCategory> = {
  Read: 'file',
  NotebookRead: 'file',
  LS: 'folder',
  Grep: 'search',
  Glob: 'search',
  ToolSearch: 'search'
}

/** `null` for a call that changes something or reaches outside the project. */
export const readCategoryOf = (name: string): ReadCategory | null => READ_CATEGORY[name] ?? null

export const isReadOnlyTool = (name: string): boolean => readCategoryOf(name) !== null
