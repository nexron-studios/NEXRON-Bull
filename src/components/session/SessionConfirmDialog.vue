<script setup lang="ts">
import { computed } from 'vue'
import { Eraser, FolderX, LoaderCircle, Square, Trash2 } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useMachineNames } from '@/composables/useMachineNames'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useSessionActionsStore } from '@/stores/sessionActions'
import { confirmationTextOf } from '@/utils/sessionActions'
import { folderNameOf } from '@/utils/sessionList'

// The one confirmation for clearing, stopping-and-removing and deleting a session and for removing
// a chat's worktree, for the whole app. It stays open while the step runs, so a slow machine does
// not look like nothing happened.
const { t } = useI18n()
const { nameOf } = useMachineNames()
const actions = useSessionActionsStore()
const { confirmation, confirmationTarget, isWorking } = storeToRefs(actions)

const ICONS = {
  clear: Eraser,
  stop_and_remove: Square,
  delete: Trash2,
  remove_worktree: FolderX
} as const

const isOpen = computed({
  get: () => confirmation.value !== null,
  set: (open) => {
    if (!open) actions.cancel()
  }
})
const text = computed(() => {
  // The tab as it is now: an approval that arrives while the dialog is open changes the notes.
  const current = confirmation.value
  const target = confirmationTarget.value
  if (!current || !target) return null
  const { notes, ...keys } = confirmationTextOf(current.kind, target)
  const params = {
    title: actions.titleOf(target),
    machine: nameOf(target.machine),
    account: target.account,
    folder: target.tab ? folderNameOf(target.tab.cwd) : ''
  }
  return {
    title: t(keys.title, params),
    body: [t(keys.body, params), ...notes.map((note) => t(note))].join(' '),
    confirm: t(keys.confirm),
    icon: ICONS[current.kind],
    isDestructive: current.kind === 'delete' || current.kind === 'remove_worktree'
  }
})
</script>

<template>
  <AlertDialog v-model:open="isOpen">
    <AlertDialogContent v-if="text">
      <AlertDialogHeader>
        <AlertDialogTitle class="break-words">{{ text.title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ text.body }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isWorking" class="touch-manipulation pointer-coarse:h-11">
          {{ t('global.cancel') }}
        </AlertDialogCancel>
        <Button
          :variant="text.isDestructive ? 'destructive' : 'default'"
          :disabled="isWorking"
          class="touch-manipulation pointer-coarse:h-11"
          @click="actions.confirm"
        >
          <LoaderCircle v-if="isWorking" class="animate-spin" aria-hidden="true" />
          <component :is="text.icon" v-else aria-hidden="true" />
          {{ text.confirm }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
