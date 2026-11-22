import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppliedSettings } from '@/composables/useAppliedSettings'
import { useProfileDefaults } from '@/composables/useProfileDefaults'
import { useTabInsights } from '@/composables/useTabInsights'
import type { ChatTabState } from '@/utils/chatTab'
import { isEffort, modelInUseOf, modelVersionOf, settingsOf } from '@/utils/sessionSettings'
import { modelFamilyOf } from '@/utils/tabInsights'

/** Names a model as people say it: `claude-opus-5-5` → "Opus 5.5", `sonnet` → "Sonnet". */
export const useModelNames = () => {
  const { t } = useI18n()

  const modelNameOf = (model: string): string => {
    const family = modelFamilyOf(model)
    if (!family) return model
    const name = t(`chat.models.${family}`)
    const version = modelVersionOf(model)
    return version ? t('composer.model_version', { model: name, version }) : name
  }

  // A level newer than Bull's list stays as Claude Code writes it.
  const effortNameOf = (effort: string): string =>
    isEffort(effort) ? t(`composer.efforts.${effort}`) : effort

  return { modelNameOf, effortNameOf }
}

/**
 * Model, effort and mode a chat runs with, and how the composer names them. The model Claude
 * last answered with gives the version ("Opus 5.5") while it is the chosen family; the effort
 * Claude reports fills in one nobody chose, so chip and thinking bar always name it.
 */
export const useSessionSettings = (tab: MaybeRefOrGetter<ChatTabState>) => {
  const { t } = useI18n()
  const { modelNameOf, effortNameOf } = useModelNames()
  const { context } = useTabInsights(toValue(tab).id)
  const defaults = useProfileDefaults(
    () => toValue(tab).machine,
    () => toValue(tab).profile
  )

  const applied = useAppliedSettings(tab)

  const answered = computed(() => context.value?.model ?? null)

  const settings = computed(() =>
    settingsOf(toValue(tab), defaults.data.value ?? null, applied.value, answered.value)
  )
  const modelLabel = computed(() => {
    const shown = modelInUseOf(settings.value.model, answered.value)
    return shown ? modelNameOf(shown) : t('composer.model_default')
  })
  const effortLabel = computed(() =>
    settings.value.effort ? effortNameOf(settings.value.effort) : null
  )
  /** "Opus 5.5 · Hoch", or the model alone while no effort is known */
  const chipLabel = computed(() =>
    effortLabel.value
      ? t('composer.model_effort', { model: modelLabel.value, effort: effortLabel.value })
      : modelLabel.value
  )

  return { settings, modelLabel, effortLabel, chipLabel }
}
