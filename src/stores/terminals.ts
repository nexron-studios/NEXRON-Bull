import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { TerminalRequest } from '@/stores/terminalRequests'
import {
  DEFAULT_DRAWER_HEIGHT,
  savedTerminalOf,
  savedTerminalsOf,
  terminalOfRequest,
  type TerminalEntry
} from '@/utils/terminalEntry'
import type { TerminalShell } from '@/utils/terminalPreferences'

export interface DrawerState {
  isOpen: boolean
  /** The terminal shown in the drawer; the others keep running behind it */
  activeId: string | null
}

const CLOSED_DRAWER: DrawerState = { isOpen: false, activeId: null }

/**
 * Every terminal Bull has open: as a tab of its own, or in the drawer under one chat. Which
 * terminal tab is shown lives here too: while one is, it replaces the chat in the content area.
 * Only the tabs are saved, and only what starts a fresh shell in the same folder.
 */
export const useTerminalStore = defineStore(
  'terminals',
  () => {
    const terminals = ref<TerminalEntry[]>([])
    /** The terminal tab on screen instead of the chat; `null` shows the chat */
    const activeTabId = ref<string | null>(null)
    const drawers = ref<Record<string, DrawerState>>({})
    const drawerHeight = ref(DEFAULT_DRAWER_HEIGHT)

    const tabs = computed(() => terminals.value.filter((entry) => entry.drawerOf === null))
    const activeTab = computed(
      () => tabs.value.find((entry) => entry.id === activeTabId.value) ?? null
    )

    const drawerOf = (chatId: string): DrawerState => drawers.value[chatId] ?? CLOSED_DRAWER
    const drawerTerminalsOf = (chatId: string): TerminalEntry[] =>
      terminals.value.filter((entry) => entry.drawerOf === chatId)

    const setDrawer = (chatId: string, next: Partial<DrawerState>) => {
      drawers.value = { ...drawers.value, [chatId]: { ...drawerOf(chatId), ...next } }
    }

    /** A new terminal tab, shown at once. */
    const openTab = (request: TerminalRequest): string => {
      const entry = terminalOfRequest(crypto.randomUUID(), request, null)
      terminals.value = [...terminals.value, entry]
      activeTabId.value = entry.id
      return entry.id
    }

    /** The terminal tab already open in that folder, else a new one; the phone keeps one each. */
    const showOrOpenTab = (request: TerminalRequest): string => {
      const open = tabs.value.find(
        (entry) => entry.machine === request.machine && entry.cwd === request.cwd
      )
      if (!open) return openTab(request)
      activeTabId.value = open.id
      return open.id
    }

    /** A new terminal in the drawer under a chat, shown there at once. */
    const openInDrawer = (chatId: string, request: TerminalRequest): string => {
      const entry = terminalOfRequest(crypto.randomUUID(), request, chatId)
      terminals.value = [...terminals.value, entry]
      setDrawer(chatId, { isOpen: true, activeId: entry.id })
      return entry.id
    }

    /** Ctrl+`: shows or hides the drawer; the first time it starts a shell in the chat's folder. */
    const toggleDrawer = (chatId: string, request: TerminalRequest) => {
      if (!drawerTerminalsOf(chatId).length) return void openInDrawer(chatId, request)
      setDrawer(chatId, { isOpen: !drawerOf(chatId).isOpen })
    }

    const showInDrawer = (chatId: string, id: string) => setDrawer(chatId, { activeId: id })

    /** Moves a terminal from the drawer to a tab of its own; its shell keeps running. */
    const maximize = (id: string) => {
      const entry = terminals.value.find((candidate) => candidate.id === id)
      if (!entry?.drawerOf) return
      const chatId = entry.drawerOf
      terminals.value = [
        ...terminals.value.filter((candidate) => candidate.id !== id),
        { ...entry, drawerOf: null }
      ]
      const rest = drawerTerminalsOf(chatId)
      setDrawer(chatId, { isOpen: rest.length > 0, activeId: rest.at(-1)?.id ?? null })
      activeTabId.value = id
    }

    const close = (id: string) => {
      const entry = terminals.value.find((candidate) => candidate.id === id)
      if (!entry) return
      terminals.value = terminals.value.filter((candidate) => candidate.id !== id)
      if (activeTabId.value === id) activeTabId.value = null
      if (!entry.drawerOf) return
      const rest = drawerTerminalsOf(entry.drawerOf)
      const drawer = drawerOf(entry.drawerOf)
      setDrawer(entry.drawerOf, {
        isOpen: drawer.isOpen && rest.length > 0,
        activeId: drawer.activeId === id ? (rest.at(-1)?.id ?? null) : drawer.activeId
      })
    }

    /** A chat went away: so do the shells in its drawer. */
    const closeDrawersExcept = (chatIds: readonly string[]) => {
      const kept = new Set(chatIds)
      terminals.value = terminals.value.filter(
        (entry) => entry.drawerOf === null || kept.has(entry.drawerOf)
      )
      drawers.value = Object.fromEntries(
        Object.entries(drawers.value).filter(([chatId]) => kept.has(chatId))
      )
    }

    const setShell = (id: string, shell: TerminalShell) => {
      terminals.value = terminals.value.map((entry) =>
        entry.id === id && entry.shell !== shell ? { ...entry, shell } : entry
      )
    }

    return {
      terminals,
      activeTabId,
      drawers,
      drawerHeight,
      tabs,
      activeTab,
      drawerOf,
      drawerTerminalsOf,
      openTab,
      showOrOpenTab,
      openInDrawer,
      toggleDrawer,
      showInDrawer,
      maximize,
      close,
      closeDrawersExcept,
      setShell
    }
  },
  {
    persist: {
      serializer: {
        serialize: (state) =>
          JSON.stringify({
            drawerHeight: state.drawerHeight,
            tabs: (state.terminals as TerminalEntry[])
              .filter((entry) => entry.drawerOf === null)
              .map(savedTerminalOf)
          }),
        deserialize: (text) => {
          const saved = JSON.parse(text) as { drawerHeight?: unknown; tabs?: unknown }
          return {
            drawerHeight:
              typeof saved.drawerHeight === 'number' ? saved.drawerHeight : DEFAULT_DRAWER_HEIGHT,
            terminals: savedTerminalsOf(saved.tabs).map((tab): TerminalEntry => ({
              ...tab,
              drawerOf: null
            }))
          }
        }
      }
    }
  }
)
