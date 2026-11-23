import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type { Machine } from '@/api/services/agentd.service'

const ROOT_STORAGE_KEY = 'bull.worktrees.roots'
const CHOICE_STORAGE_KEY = 'bull.worktrees.byFolder'

/** This computer is `''`: storage keys are strings. */
const machineKeyOf = (machine: Machine) => machine ?? ''

/** A folder is the same on one machine only; the same path elsewhere is another repository. */
const folderKeyOf = (machine: Machine, folder: string) =>
  `${machineKeyOf(machine)}|${folder.trim()}`

/**
 * Whether new chats in a repository get their own worktree (on unless switched off for that
 * folder), and where each machine puts worktrees. Per machine, because a path on this PC means
 * nothing on a server. An empty root leaves it to agentd: `worktrees` beside the folder that
 * holds the repository.
 */
export const useWorktreeSettingsStore = defineStore('worktreeSettings', () => {
  const roots = useStorage<Record<string, string>>(ROOT_STORAGE_KEY, {})
  const choices = useStorage<Record<string, boolean>>(CHOICE_STORAGE_KEY, {})

  /** Some machine puts its worktrees somewhere of its own choosing. */
  const hasOwnRoot = computed(() => Object.keys(roots.value).length > 0)

  const isWanted = (machine: Machine, folder: string) =>
    choices.value[folderKeyOf(machine, folder)] ?? true

  const setWanted = (machine: Machine, folder: string, isOn: boolean) => {
    choices.value = { ...choices.value, [folderKeyOf(machine, folder)]: isOn }
  }

  const rootOf = (machine: Machine) => roots.value[machineKeyOf(machine)] ?? ''

  const setRoot = (machine: Machine, root: string) => {
    const { [machineKeyOf(machine)]: _old, ...others } = roots.value
    const trimmed = root.trim()
    roots.value = trimmed ? { ...others, [machineKeyOf(machine)]: trimmed } : others
  }

  /** What agentd gets: `null` for its own default. */
  const rootOrDefault = (machine: Machine) => rootOf(machine) || null

  return { roots, choices, hasOwnRoot, isWanted, setWanted, rootOf, setRoot, rootOrDefault }
})
