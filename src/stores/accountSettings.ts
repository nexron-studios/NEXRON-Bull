import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type { Machine } from '@/api/services/agentd.service'
import type { ProfileProps } from '@/types/agentd.type'
import type { AccountTone } from '@/utils/quota'
import {
  EMPTY_ACCOUNT_SETTINGS,
  defaultProfileOf,
  isOffered,
  offeredProfilesOf,
  toneOf,
  withAccountSettingDefaults,
  withAdoptedTones,
  withDefault,
  withOffered,
  withTone,
  type AccountSettings
} from '@/utils/accountSettings'

const STORAGE_KEY = 'bull.accounts'

/**
 * Which Claude accounts Bull offers, the default for new chats per machine and picked colours.
 * Per machine and profile folder; the accounts themselves are listed by agentd.
 */
export const useAccountSettingsStore = defineStore('accountSettings', () => {
  const settings = useStorage<AccountSettings>(STORAGE_KEY, EMPTY_ACCOUNT_SETTINGS, localStorage, {
    mergeDefaults: withAccountSettingDefaults
  })

  const setOffered = (machine: Machine, dir: string, isWanted: boolean) => {
    settings.value = withOffered(settings.value, machine, dir, isWanted)
  }
  const setDefault = (machine: Machine, dir: string) => {
    settings.value = withDefault(settings.value, machine, dir)
  }
  const setTone = (accountKey: string, tone: AccountTone) => {
    settings.value = withTone(settings.value, accountKey, tone)
  }
  const adoptTones = (machine: Machine, profiles: ProfileProps[]) => {
    const next = withAdoptedTones(settings.value, machine, profiles)
    if (next !== settings.value) settings.value = next
  }

  const isOfferedOn = (machine: Machine, dir: string) => isOffered(settings.value, machine, dir)
  const offeredOf = (machine: Machine, profiles: ProfileProps[]) =>
    offeredProfilesOf(settings.value, machine, profiles)
  const defaultOf = (machine: Machine, profiles: ProfileProps[]) =>
    defaultProfileOf(settings.value, machine, profiles)
  const toneOfKey = (accountKey: string) => toneOf(settings.value, accountKey)

  return {
    settings,
    setOffered,
    setDefault,
    setTone,
    adoptTones,
    isOfferedOn,
    offeredOf,
    defaultOf,
    toneOfKey
  }
})
