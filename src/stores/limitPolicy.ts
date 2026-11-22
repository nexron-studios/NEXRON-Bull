import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { FolderRuleProps, LimitMode, LimitPolicy } from '@/types/agentd.type'
import { DEFAULT_LIMIT_POLICY, withRule, withShownOrder, withoutRule } from '@/utils/limitPolicy'

/**
 * What happens when a Claude account hits its plan limit (settings "Limits"). The policy is the
 * same on every machine; `useLimitPolicySync` hands it to each agentd, which decides with it.
 */
export const useLimitPolicyStore = defineStore(
  'limitPolicy',
  () => {
    const policy = ref<LimitPolicy>(structuredClone(DEFAULT_LIMIT_POLICY))
    /** App only: a toast when a waiting message goes out at the reset */
    const notifyQueueSent = ref(true)

    const update = (change: Partial<LimitPolicy>) => {
      policy.value = { ...policy.value, ...change }
    }
    const setMode = (mode: LimitMode) => update({ mode })
    const setSuggestEarly = (suggest_early: boolean) => update({ suggest_early })
    const setQueue = (queue: boolean) => update({ queue })
    /** `shown`: the labels as the settings list them after the user moved one */
    const setOrder = (shown: string[]) =>
      update({ order: withShownOrder(policy.value.order, shown) })
    const saveRule = (rule: FolderRuleProps, editing: string | null) =>
      update({ rules: withRule(policy.value.rules, rule, editing) })
    const removeRule = (folder: string) =>
      update({ rules: withoutRule(policy.value.rules, folder) })

    return {
      policy,
      notifyQueueSent,
      setMode,
      setSuggestEarly,
      setQueue,
      setOrder,
      saveRule,
      removeRule
    }
  },
  { persist: { key: 'bull.limits' } }
)
