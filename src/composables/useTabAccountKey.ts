import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useProfiles } from '@/composables/useAgentdCatalog'
import type { ChatTabState } from '@/utils/chatTab'
import { accountKeyOf } from '@/utils/quota'

const DEFAULT_PROFILE_LABEL = 'default'

/** The account key (`accountKeyOf`) of the account a tab runs on, for its colour. */
export const useTabAccountKey = (tab: MaybeRefOrGetter<ChatTabState>) => {
  const profiles = useProfiles(() => toValue(tab).machine)
  return computed(() => {
    const { machine, profile } = toValue(tab)
    // The default profile is `null` in a tab but has a folder in the profile list.
    const known = profiles.data.value?.find((p) =>
      profile === null ? p.label === DEFAULT_PROFILE_LABEL : p.dir === profile
    )
    return accountKeyOf({
      email: known?.email ?? null,
      machine,
      profile: known?.dir ?? profile ?? DEFAULT_PROFILE_LABEL
    })
  })
}
