import type { Component } from 'vue'
import { Gauge, LayoutDashboard, MessagesSquare } from '@lucide/vue'
import type { RouteLocationNormalized } from 'vue-router'
import type { TabDirection } from '@/utils/motion'
import { settingsSectionList, shownSettingsSectionOf } from '@/utils/settings'

/** The app's pages, in the order every navigation shows them; each is a route name. */
export const navPageList = ['chat', 'overview', 'usage'] as const
export type NavPage = (typeof navPageList)[number]

/** One icon per page, the same in the sidebar, the rail and the phone's bottom bar. */
export const NAV_ICON: Record<NavPage, Component> = {
  chat: MessagesSquare,
  overview: LayoutDashboard,
  usage: Gauge
}

type PageRoute = Pick<RouteLocationNormalized, 'name' | 'params'>

/** Every page in navigation order: the sidebar and the bottom bar both end with settings. */
export const navItemList = [...navPageList, 'settings'] as const

const pageIndexOf = (route: PageRoute): number =>
  navItemList.findIndex((item) => item === route.name)

// The phone's list of sections comes before its first section, as it does on screen.
const sectionIndexOf = (route: PageRoute, isPhone: boolean): number => {
  const section = shownSettingsSectionOf(route.params.section, isPhone)
  return section ? settingsSectionList.indexOf(section) : -1
}

/**
 * Which way a page change moves, by where its link sits in the navigation: `next` when the new
 * page or settings section is further down than the old one. Null when the same thing stays on
 * screen, such as the bare settings page and its first section.
 */
export const pageDirectionOf = (
  from: PageRoute,
  to: PageRoute,
  isPhone: boolean
): TabDirection | null => {
  const pageStep = pageIndexOf(to) - pageIndexOf(from)
  const step =
    pageStep ||
    (to.name === 'settings' ? sectionIndexOf(to, isPhone) - sectionIndexOf(from, isPhone) : 0)
  if (!step) return null
  return step > 0 ? 'next' : 'prev'
}
