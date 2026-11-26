import { tryOnScopeDispose } from '@vueuse/core'
import { toast } from '@/lib/toast'
import { useI18n } from 'vue-i18n'
import { copyText } from '@/lib/clipboard'
import { useChatStore } from '@/stores/chat'
import { useChatSettingsStore } from '@/stores/chatSettings'
import { useContextUsageStore } from '@/stores/contextUsage'
import { useRewindStore } from '@/stores/rewind'
import { useSessionActionsStore } from '@/stores/sessionActions'
import { useSlashCommandsStore } from '@/stores/slashCommands'
import { chatMarkdownOf } from '@/utils/chatExport'
import { targetOfTab } from '@/utils/sessionActions'

/**
 * The slash commands Bull runs itself instead of handing them to Claude: `/clear` asks like the
 * chat menu does, `/export` copies the chat as Markdown (headless Claude Code has no `/export`),
 * `/model`, `/rewind` and `/context` open the picker and dialogs their buttons open.
 */
export const useBullSlashCommands = () => {
  const { t } = useI18n()
  const chat = useChatStore()
  const actions = useSessionActionsStore()
  const commands = useSlashCommandsStore()
  const chatSettings = useChatSettingsStore()
  const rewind = useRewindStore()
  const contextUsage = useContextUsageStore()

  const tabOf = (tabId: string) => chat.tabs.find((tab) => tab.id === tabId)

  const clear = (tabId: string) => {
    const tab = tabOf(tabId)
    if (!tab) return false
    actions.act('clear', targetOfTab(tab))
  }

  const exportChat = (tabId: string) => {
    const tab = tabOf(tabId)
    if (!tab) return false
    const labels = {
      user: t('prompt_input.export_user'),
      claude: t('prompt_input.export_claude'),
      image: t('prompt_input.export_image')
    }
    const markdown = chatMarkdownOf(tab.messages, labels)
    if (!markdown) return void toast(t('prompt_input.export_empty'))
    void copyText(markdown)
  }

  const unregister = [
    commands.register('clear', clear),
    commands.register('export', exportChat),
    commands.register('model', chatSettings.openModelPicker),
    commands.register('rewind', (tabId) => rewind.openRewind(tabId)),
    commands.register('context', contextUsage.openContext)
  ]
  tryOnScopeDispose(() => unregister.forEach((release) => release()))
}
