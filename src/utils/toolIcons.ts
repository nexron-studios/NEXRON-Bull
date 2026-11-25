import type { Component } from 'vue'
import {
  Bot,
  Check,
  CircleDashed,
  FilePen,
  FileText,
  FolderOpen,
  Globe,
  ListChecks,
  LoaderCircle,
  Plug,
  Search,
  SquareTerminal,
  WandSparkles,
  Wrench,
  X
} from '@lucide/vue'
import type { ToolRunStatus } from '@/utils/tabActivity'
import type { ToolIcon, ToolKind } from '@/utils/toolKind'

/** The Lucide icon of each tool picture: tool cards and the overview's live line share it. */
export const TOOL_ICON: Record<ToolIcon, Component> = {
  file: FileText,
  folder: FolderOpen,
  search: Search,
  edit: FilePen,
  terminal: SquareTerminal,
  web: Globe,
  agent: Bot,
  tasks: ListChecks,
  plug: Plug,
  skill: WandSparkles,
  wrench: Wrench
}

/** Read, change and outside each have their act colour; a skill has the skills orange. */
export const TOOL_KIND_CLASS: Record<ToolKind, string> = {
  read: 'text-act-read',
  change: 'text-act-change',
  outside: 'text-act-outside',
  skill: 'text-clawd'
}

/** The tint behind a skill's row in chat and panel, so a running code review is seen at a glance. */
export const SKILL_ROW_TINT = 'bg-clawd/10'

/** How a tool call's state looks in the panel: the activity list and a subagent's actions. */
export const TOOL_RUN_LOOK: Record<ToolRunStatus, { icon: Component; class: string }> = {
  running: { icon: LoaderCircle, class: 'text-warning motion-safe:animate-spin' },
  done: { icon: Check, class: 'text-good' },
  failed: { icon: X, class: 'text-critical' },
  stopped: { icon: CircleDashed, class: 'text-muted-foreground' }
}
