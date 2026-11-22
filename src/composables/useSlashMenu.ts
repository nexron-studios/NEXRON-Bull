import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import { useFuse } from '@vueuse/integrations/useFuse'
import { useI18n } from 'vue-i18n'
import { useSlashCommandsStore } from '@/stores/slashCommands'
import { COMMAND_FUSE_OPTIONS, commandSectionsOf } from '@/utils/composerMenu'
import { bullCommandList, menuCommandsOf, type BullCommand } from '@/utils/slashCommands'

/**
 * The `/` menu of one tab: Bull's own commands and what that tab's Claude lists, searched
 * fuzzily over name and description. `isWaiting`: Claude has not listed its commands yet.
 */
export const useSlashMenu = (tabId: MaybeRefOrGetter<string>, query: Ref<string>) => {
  const { t } = useI18n()
  const store = useSlashCommandsStore()

  const listed = computed(() => store.commandsOf(toValue(tabId)))
  const bullDescriptions = computed(
    () =>
      Object.fromEntries(
        bullCommandList.map((name) => [name, t(`prompt_input.bull_commands.${name}`)])
      ) as Record<BullCommand, string>
  )
  const commands = computed(() =>
    menuCommandsOf(listed.value, store.handled, bullDescriptions.value)
  )
  const { results } = useFuse(query, commands, {
    fuseOptions: COMMAND_FUSE_OPTIONS,
    matchAllWhenSearchEmpty: true
  })
  const sections = computed(() => commandSectionsOf(results.value))
  const isWaiting = computed(() => !listed.value.length)

  return { sections, isWaiting }
}
