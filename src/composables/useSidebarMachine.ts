import { computed, watch } from 'vue'
import { StorageSerializers, createSharedComposable, useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useMachines } from '@/composables/useAgentdCatalog'
import i18n from '@/i18n'
import { useChatStore } from '@/stores/chat'
import type { ChatTabState } from '@/utils/chatTab'

/** Tab value for this computer; Reka tabs cannot hold null. */
export const THIS_MACHINE = 'this'
const MACHINE_STORAGE_KEY = 'bull.sidebar.machine'
const KNOWN_HOSTS_STORAGE_KEY = 'bull.sidebar.knownHosts'

/**
 * Which machine the sidebar shows. Shared: panel and rail ask at the same time, and the hosts,
 * segments and per-machine tabs are worked out once (the tabs on every streamed token).
 */
export const useSidebarMachine = createSharedComposable(() => {
  const { t } = i18n.global
  const { tabs, activeTab } = storeToRefs(useChatStore())
  const machines = useMachines()
  const storedMachine = useStorage(MACHINE_STORAGE_KEY, THIS_MACHINE)
  // The hosts of the last list that arrived; `null` until one ever did. While the list loads or
  // after it failed, the switcher shows these, so it neither jumps in nor vanishes.
  const knownHosts = useStorage<string[] | null>(KNOWN_HOSTS_STORAGE_KEY, null, undefined, {
    serializer: StorageSerializers.object
  })

  // Hosts from ~/.ssh/config (or the last known ones) plus every host a tab runs on, so a remote
  // tab always keeps its segment and the switcher never hides the way back.
  const hosts = computed(() => [
    ...new Set([
      ...(machines.data.value ?? knownHosts.value ?? []),
      ...tabs.value.flatMap((tab) => (tab.machine ? [tab.machine] : []))
    ])
  ])
  // A stored host that is not known (yet, or any more) shows this computer instead.
  const machineKey = computed({
    get: () => (hosts.value.includes(storedMachine.value) ? storedMachine.value : THIS_MACHINE),
    set: (key: string) => {
      storedMachine.value = key
    }
  })
  const machine = computed(() => (machineKey.value === THIS_MACHINE ? null : machineKey.value))
  const segments = computed(() => [
    { key: THIS_MACHINE, machine: null, label: t('chat.this_machine') },
    ...hosts.value.map((host) => ({ key: host, machine: host, label: host }))
  ])
  const machineLabel = computed(
    () => segments.value.find((segment) => segment.key === machineKey.value)?.label ?? ''
  )
  // Only the very first start has nothing to show yet; afterwards the known hosts stand in.
  const isSwitcherPending = computed(
    () => machines.isPending.value && knownHosts.value === null && segments.value.length < 2
  )
  // One pass over the tabs for all segments; it runs on every streamed token.
  const tabsByMachine = computed(() => {
    const byMachine = new Map<string | null, ChatTabState[]>()
    for (const tab of tabs.value) {
      const list = byMachine.get(tab.machine)
      if (list) list.push(tab)
      else byMachine.set(tab.machine, [tab])
    }
    return byMachine
  })

  watch(
    () => machines.data.value,
    (hostList) => {
      if (hostList) knownHosts.value = hostList
    }
  )
  // A first list that fails leaves nothing to stand in; the next start then shows no placeholder
  // instead of one that would jump away again.
  watch(
    () => machines.isError.value,
    (isError) => {
      if (isError && knownHosts.value === null) knownHosts.value = []
    }
  )

  // Picking a tab in the header shows its machine here, also on the same machine after the user
  // looked at another one, and right after opening.
  watch(
    () => activeTab.value?.id,
    () => {
      const tab = activeTab.value
      if (tab) machineKey.value = tab.machine ?? THIS_MACHINE
    },
    { immediate: true }
  )

  return {
    machineKey,
    machine,
    machineLabel,
    segments,
    tabsByMachine,
    isSwitcherPending
  }
})
