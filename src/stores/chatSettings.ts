import { ref } from 'vue'
import { defineStore } from 'pinia'
import { agentdService } from '@/api/services/agentd.service'
import { handleError } from '@/lib/error'
import { queryClient } from '@/lib/queryClient'
import { useChatStore } from '@/stores/chat'
import type { ChatTabState, PermissionMode } from '@/utils/chatTab'
import { appliedSettingsKey, type Effort, type ModelAlias } from '@/utils/sessionSettings'

type Change = Partial<Pick<ChatTabState, 'model' | 'effort' | 'permissionMode'>>
type ChangeKey = keyof Change

/** Claude answers a change within a moment, even mid-turn; a silent machine counts as refused. */
const CONFIGURE_TIMEOUT_MS = 15_000

/**
 * Mode, model and effort of a chat, changed while it runs: Claude gets the change at once and
 * uses it from its next step. A stopped chat keeps it for its next start (`--resume` with the
 * flags). Also which chat's model picker is open, so `/model` can open it.
 */
export const useChatSettingsStore = defineStore('chatSettings', () => {
  /** The tab whose model picker is open; `null` while none is */
  const pickerTabId = ref<string | null>(null)
  /** Modes Claude refused per tab; Shift+Tab and the chip skip them until the app restarts */
  const refusedModes = ref<Record<string, PermissionMode[]>>({})

  const patch = (id: string, change: Change) => {
    const chat = useChatStore()
    chat.tabs = chat.tabs.map((tab) => (tab.id === id ? { ...tab, ...change } : tab))
  }

  /** Puts back what a refused change replaced, unless a later change landed meanwhile. */
  const undo = (id: string, change: Change, before: Change) => {
    const tab = useChatStore().tabs.find((t) => t.id === id)
    if (!tab) return
    const keys = Object.keys(change) as ChangeKey[]
    const stillOurs = keys.filter((key) => tab[key] === change[key])
    patch(id, Object.fromEntries(stillOurs.map((key) => [key, before[key]])))
  }

  // Shown at once; Claude refusing it (or an agentd without the op) puts the old value back.
  const configure = async (id: string, change: Change) => {
    const tab = useChatStore().tabs.find((t) => t.id === id)
    if (!tab) return
    const keys = Object.keys(change) as ChangeKey[]
    const before: Change = Object.fromEntries(keys.map((key) => [key, tab[key]]))
    patch(id, change)
    if (tab.status === 'ended') return
    try {
      await agentdService.ask<'configured'>(
        {
          op: 'configure',
          tab: id,
          permission_mode: change.permissionMode ?? null,
          model: change.model ?? null,
          effort: change.effort ?? null
        },
        tab.machine,
        CONFIGURE_TIMEOUT_MS
      )
      // Asked only now: before, Claude may still name the effort of the model it left.
      void queryClient.invalidateQueries({ queryKey: appliedSettingsKey(tab.machine, id) })
    } catch (error) {
      undo(id, change, before)
      const mode = change.permissionMode
      if (mode && !refusedModesOf(id).includes(mode)) {
        refusedModes.value = { ...refusedModes.value, [id]: [...refusedModesOf(id), mode] }
      }
      handleError(error)
    }
  }

  const refusedModesOf = (id: string): PermissionMode[] => refusedModes.value[id] ?? []

  const setMode = (id: string, permissionMode: PermissionMode) => configure(id, { permissionMode })
  const setModel = (id: string, model: ModelAlias) => configure(id, { model })
  const setEffort = (id: string, effort: Effort) => configure(id, { effort })

  /** Opens the model and effort picker of a chat, e.g. for the slash command `/model`. */
  const openModelPicker = (tabId: string) => {
    pickerTabId.value = tabId
  }
  const closeModelPicker = () => {
    pickerTabId.value = null
  }

  return {
    pickerTabId,
    refusedModes,
    refusedModesOf,
    setMode,
    setModel,
    setEffort,
    openModelPicker,
    closeModelPicker
  }
})
