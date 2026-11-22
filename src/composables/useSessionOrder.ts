import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useStorage } from '@vueuse/core'
import type { Machine } from '@/api/services/agentd.service'
import { withGroupOrder } from '@/utils/order'

const ORDER_STORAGE_KEY = 'bull.sidebar.order'
/** Storage key of this computer's order; SSH aliases are never empty. */
const THIS_MACHINE_ORDER = ''

/** The order the user dragged the sessions of one machine into, kept across restarts. */
export const useSessionOrder = (machine: MaybeRefOrGetter<Machine>) => {
  const order = useStorage<Record<string, string[]>>(ORDER_STORAGE_KEY, {})

  const key = computed(() => toValue(machine) ?? THIS_MACHINE_ORDER)
  const stored = computed(() => order.value[key.value] ?? [])

  /** Stores the order of one group after a drag; `existing` drops keys of closed sessions. */
  const reorder = (keys: string[], existing: Set<string>) => {
    order.value = { ...order.value, [key.value]: withGroupOrder(stored.value, keys, existing) }
  }

  return { stored, reorder }
}
