import type { HighlightPiece } from '@/utils/highlight'

export const menuRowIconList = ['command', 'file', 'folder'] as const
export type MenuRowIcon = (typeof menuRowIconList)[number]

/** One suggestion as the composer menu draws it, the same for commands and files. */
export interface MenuRowProps {
  key: string
  label: HighlightPiece[]
  /** What the command takes (`<instructions>`), shown muted after the name */
  hint: string
  detail: HighlightPiece[]
  /** Where a custom command comes from, or nothing */
  tag: string | null
  icon: MenuRowIcon
}

export interface MenuSectionProps {
  title: string
  rows: MenuRowProps[]
}
