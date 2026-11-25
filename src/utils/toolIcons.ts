import type { Component } from 'vue'
import {
  Bot,
  BrushCleaning,
  CalendarClock,
  Check,
  CircleDashed,
  FilePen,
  FilePlus,
  FileText,
  FolderOpen,
  Globe,
  ListChecks,
  LoaderCircle,
  Play,
  Plug,
  Repeat,
  Search,
  SearchCheck,
  Settings2,
  ShieldCheck,
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
  wrench: Wrench,
  skill: WandSparkles,
  review: SearchCheck,
  security: ShieldCheck,
  simplify: BrushCleaning,
  play: Play,
  loop: Repeat,
  schedule: CalendarClock,
  init: FilePlus,
  config: Settings2
}

/** Read, change, outside and skill each have their act colour. */
export const TOOL_KIND_CLASS: Record<ToolKind, string> = {
  read: 'text-act-read',
  change: 'text-act-change',
  outside: 'text-act-outside',
  skill: 'text-act-skill'
}

/** How a tool call's state looks in the panel: the activity list and a subagent's actions. */
export const TOOL_RUN_LOOK: Record<ToolRunStatus, { icon: Component; class: string }> = {
  running: { icon: LoaderCircle, class: 'text-warning motion-safe:animate-spin' },
  done: { icon: Check, class: 'text-good' },
  failed: { icon: X, class: 'text-critical' },
  stopped: { icon: CircleDashed, class: 'text-muted-foreground' }
}
