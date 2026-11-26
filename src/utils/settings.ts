import type { Component } from 'vue'
import {
  ArrowLeftRight,
  Bell,
  FolderGit2,
  GitFork,
  Globe,
  Monitor,
  RefreshCw,
  SquareTerminal,
  Sun,
  UserRound
} from '@lucide/vue'

/** The links under the version: where Bull's code lives and who makes it. */
export const creatorLinkList = ['source', 'website'] as const
export type CreatorLink = (typeof creatorLinkList)[number]

export const CREATOR_LINK: Record<CreatorLink, { url: string; icon: Component }> = {
  source: { url: 'https://github.com/nexron-studios/NEXRON-Bull', icon: FolderGit2 },
  website: { url: 'https://www.nexron-studios.com/', icon: Globe }
}

/** The sections of the settings page, in the order its navigation shows them (Figma "22", "M22"). */
export const settingsSectionList = [
  'accounts',
  'limits',
  'machines',
  'notifications',
  'terminal',
  'worktrees',
  'appearance',
  'updates'
] as const
export type SettingsSection = (typeof settingsSectionList)[number]

export const SETTINGS_SECTION_ICON: Record<SettingsSection, Component> = {
  accounts: UserRound,
  limits: ArrowLeftRight,
  machines: Monitor,
  notifications: Bell,
  terminal: SquareTerminal,
  worktrees: GitFork,
  appearance: Sun,
  updates: RefreshCw
}

/**
 * Sections only the app window can serve: the machine checks run ssh from it, and terminals are
 * its own processes. A browser reaches agentd through the bridge and has neither, and nothing
 * installed to update.
 */
const DESKTOP_ONLY_SECTIONS: readonly SettingsSection[] = ['machines', 'terminal', 'updates']

/** The sections this window offers, in their order. */
export const offeredSettingsSectionsOf = (isDesktopApp: boolean): SettingsSection[] =>
  settingsSectionList.filter((section) => isDesktopApp || !DESKTOP_ONLY_SECTIONS.includes(section))

/** The section in `/settings/:section`; `null` for the bare page or an unknown name. */
export const settingsSectionOf = (
  param: unknown,
  offered: readonly SettingsSection[] = settingsSectionList
): SettingsSection | null => offered.find((section) => section === param) ?? null

/**
 * The section the page shows for `/settings/:section`. A phone shows the list (`null`) on the bare
 * page; wider up there is room for a section next to the list, so the bare page opens the first.
 */
export const shownSettingsSectionOf = (
  param: unknown,
  isPhone: boolean,
  offered: readonly SettingsSection[] = settingsSectionList
): SettingsSection | null =>
  isPhone ? settingsSectionOf(param, offered) : (settingsSectionOf(param, offered) ?? offered[0])
