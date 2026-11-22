import type { Component } from 'vue'
import {
  ArrowLeftRight,
  Bell,
  FolderGit2,
  Globe,
  Monitor,
  SquareTerminal,
  Sun,
  UserRound
} from '@lucide/vue'

/** The links under the version: where Bull's code lives and who makes it. */
export const creatorLinkList = ['source', 'website'] as const
export type CreatorLink = (typeof creatorLinkList)[number]

export const CREATOR_LINK: Record<CreatorLink, { url: string; icon: Component }> = {
  source: { url: 'https://github.com/nexron-studios/NEXRON-chat', icon: FolderGit2 },
  website: { url: 'https://www.nexron-studios.com/', icon: Globe }
}

/** The sections of the settings page, in the order its navigation shows them (Figma "22", "M22"). */
export const settingsSectionList = [
  'accounts',
  'limits',
  'machines',
  'notifications',
  'terminal',
  'appearance'
] as const
export type SettingsSection = (typeof settingsSectionList)[number]

export const SETTINGS_SECTION_ICON: Record<SettingsSection, Component> = {
  accounts: UserRound,
  limits: ArrowLeftRight,
  machines: Monitor,
  notifications: Bell,
  terminal: SquareTerminal,
  appearance: Sun
}

/** The section in `/settings/:section`; `null` for the bare page or an unknown name. */
export const settingsSectionOf = (param: unknown): SettingsSection | null =>
  settingsSectionList.find((section) => section === param) ?? null

/**
 * The section the page shows for `/settings/:section`. A phone shows the list (`null`) on the bare
 * page; wider up there is room for a section next to the list, so the bare page opens the first.
 */
export const shownSettingsSectionOf = (param: unknown, isPhone: boolean): SettingsSection | null =>
  isPhone ? settingsSectionOf(param) : (settingsSectionOf(param) ?? settingsSectionList[0])
