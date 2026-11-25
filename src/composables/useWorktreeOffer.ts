import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import { refDebounced } from '@vueuse/core'
import type { Machine } from '@/api/services/agentd.service'
import { useGitBranch } from '@/composables/useGitBranch'
import { useWorktreeSettingsStore } from '@/stores/worktreeSettings'

/** A typed folder is checked for a repository once typing pauses, not per keystroke. */
const FOLDER_CHECK_MS = 300

/**
 * The own-worktree switch (`worktree.own`) for a new chat on `cwd`: offered for a main checkout
 * only (a folder that already is a worktree is where the chat should work), on unless switched
 * off for that folder. `isSettled`: the check has answered for the folder typed now, so a quick
 * start does not go without a worktree the switch would have offered.
 */
export const useWorktreeOffer = (cwd: Ref<string>, machine: MaybeRefOrGetter<Machine>) => {
  const settings = useWorktreeSettingsStore()
  const checkedFolder = refDebounced(cwd, FOLDER_CHECK_MS)
  const repo = useGitBranch(() => checkedFolder.value.trim(), machine)

  // Checked against the folder the answer is about, so a quick edit cannot inherit the last one's.
  const canHaveWorktree = computed(
    () =>
      checkedFolder.value.trim() === cwd.value.trim() &&
      !!repo.data.value?.branch &&
      repo.data.value.checkout.kind === 'main'
  )
  const isWorktreeWanted = computed({
    get: () => settings.isWanted(toValue(machine), cwd.value),
    set: (isWanted: boolean) => settings.setWanted(toValue(machine), cwd.value, isWanted)
  })
  const isWorktreePlanned = computed(() => canHaveWorktree.value && isWorktreeWanted.value)
  // A machine that cannot answer has nothing to wait for.
  const isSettled = computed(
    () =>
      repo.isUnknown.value ||
      (checkedFolder.value.trim() === cwd.value.trim() && !repo.isFetching.value)
  )

  return { canHaveWorktree, isWorktreeWanted, isWorktreePlanned, isSettled }
}
