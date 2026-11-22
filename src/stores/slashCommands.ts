import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { agentdService } from '@/api/services/agentd.service'
import type { AgentdEvent, SlashCommandProps } from '@/types/agentd.type'

/**
 * Runs a slash command the app handles itself, for the tab it was typed in; `args` is what
 * followed the name. Returning `false` hands the command to Claude after all.
 */
export type SlashCommandHandler = (tabId: string, args: string) => boolean | void

/**
 * The slash menu's two sources: what each tab's Claude lists (agentd's `commands` event) and the
 * commands Bull handles itself. A feature registers its command here, e.g. the context panel:
 * `useSlashCommandsStore().register('context', (tabId) => openContext(tabId))`; it then shows in
 * the menu's "In Bull" group and runs instead of going to Claude.
 */
export const useSlashCommandsStore = defineStore('slashCommands', () => {
  const byTab = ref<Record<string, SlashCommandProps[]>>({})
  // Functions, not state to watch deeply.
  const handlers = shallowRef(new Map<string, SlashCommandHandler>())

  const handled = computed(() => new Set(handlers.value.keys()))

  const commandsOf = (tabId: string): SlashCommandProps[] => byTab.value[tabId] ?? []

  /** Takes over `/name` (without the slash); the returned function gives it back. */
  const register = (name: string, handler: SlashCommandHandler) => {
    handlers.value = new Map(handlers.value).set(name, handler)
    return () => {
      if (handlers.value.get(name) !== handler) return
      const next = new Map(handlers.value)
      next.delete(name)
      handlers.value = next
    }
  }

  /** Whether the app took the command; `false` means it goes to Claude as a prompt. */
  const run = (tabId: string, name: string, args: string): boolean => {
    const handler = handlers.value.get(name)
    if (!handler) return false
    return handler(tabId, args) !== false
  }

  const forget = (tabId: string) => {
    const { [tabId]: _forgotten, ...rest } = byTab.value
    byTab.value = rest
  }

  const onEvent = (event: AgentdEvent) => {
    if (event.type === 'commands') byTab.value = { ...byTab.value, [event.tab]: event.commands }
  }

  agentdService.onEvent(onEvent)

  return { byTab, handlers, handled, commandsOf, register, run, forget }
})
