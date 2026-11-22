import { computed, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Machine } from '@/api/services/agentd.service'
import { useProfileDefaults } from '@/composables/useProfileDefaults'
import { useModelNames } from '@/composables/useSessionSettings'
import { settingsOf } from '@/utils/sessionSettings'

const NOTHING_CHOSEN = { model: null, effort: null, permissionMode: null }

/**
 * The "account's default" choices of the new-session dialog, named after what will run:
 * "Standard des Kontos · Opus". Without a model in the account, or without an answer from its
 * machine, the hint says what that means instead.
 */
export const useAccountDefaultLabels = (
  machine: MaybeRefOrGetter<Machine>,
  profile: MaybeRefOrGetter<string | null>,
  isEnabled: MaybeRefOrGetter<boolean>
) => {
  const { t } = useI18n()
  const { modelNameOf } = useModelNames()
  const defaults = useProfileDefaults(machine, profile, isEnabled)

  const known = computed(() => defaults.data.value ?? null)
  const modelLabel = computed(() => {
    const model = known.value?.model
    return model
      ? t('chat.account_default_named', { name: modelNameOf(model) })
      : t('chat.account_default')
  })
  // Claude Code asks first when the account sets no mode, so a known account always names one.
  const mode = computed(() => (known.value ? settingsOf(NOTHING_CHOSEN, known.value).mode : null))
  const modeLabel = computed(() =>
    mode.value
      ? t('chat.account_default_named', { name: t(`chat.modes.${mode.value}`) })
      : t('chat.account_default')
  )
  const unknownHint = computed(() =>
    defaults.isError.value ? t('chat.account_default_unknown_hint') : null
  )
  const modelHint = computed(() =>
    known.value && !known.value.model ? t('chat.account_default_model_hint') : unknownHint.value
  )

  return { modelLabel, mode, modeLabel, modelHint, modeHint: unknownHint }
}
