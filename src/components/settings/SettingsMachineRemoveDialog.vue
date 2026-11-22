<script setup lang="ts">
import { LoaderCircle, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
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

// Taking a machine out of Bull's list. Only while no chat is open there: its tab would lose the
// way back to the machine.
const {
  machine,
  openChats,
  isWorking = false
} = defineProps<{ machine: string; openChats: number; isWorking?: boolean }>()

const emit = defineEmits<{ confirm: [] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle class="break-words">
          {{ t('settings.machines.remove_title', { machine }) }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{
            openChats
              ? t('settings.machines.remove_blocked', { machine, count: openChats }, openChats)
              : t('settings.machines.remove_body', { machine })
          }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isWorking" class="touch-manipulation pointer-coarse:h-11">
          {{ t('global.cancel') }}
        </AlertDialogCancel>
        <Button
          v-if="!openChats"
          variant="destructive"
          :disabled="isWorking"
          class="touch-manipulation pointer-coarse:h-11"
          @click="emit('confirm')"
        >
          <LoaderCircle v-if="isWorking" class="animate-spin" aria-hidden="true" />
          <Trash2 v-else aria-hidden="true" />
          {{ t('settings.machines.remove') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
