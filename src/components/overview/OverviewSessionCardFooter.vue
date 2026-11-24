<script setup lang="ts">
import { computed } from 'vue'
import { Folder, SquareArrowOutUpRight, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Button } from '@/components/ui/button'
import { useMachineLabel } from '@/composables/useMachineLabel'
import { useSessionActionsStore } from '@/stores/sessionActions'
import type { ChatTabState } from '@/utils/chatTab'
import { isActionAvailable, targetOfTab } from '@/utils/sessionActions'
import { folderNameOf } from '@/utils/sessionList'

// The card's buttons, always in the same place (Agent Dashboard): where it runs, clearing the chat
// and the way into it. The trash clears like the dashboard's `/clear`, through the app's one
// confirmation; Bull has no way to open a folder, so the folder is a label, not a button.
const { tab, title } = defineProps<{ tab: ChatTabState; title: string }>()
const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()
const { labelOf: machineLabelOf } = useMachineLabel()
const actions = useSessionActionsStore()

const target = computed(() => targetOfTab(tab))
const canClear = computed(() => isActionAvailable('clear', target.value))
const machine = computed(() => machineLabelOf(tab.machine))
const clear = () => actions.act('clear', target.value)
</script>

<template>
  <div class="mt-auto flex items-center gap-2 pt-5">
    <span
      class="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-small font-medium text-subtle"
    >
      <Folder class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="truncate">{{ folderNameOf(tab.cwd) }}</span>
      <span v-if="machine" class="truncate font-normal text-muted-foreground">· {{ machine }}</span>
    </span>
    <div class="ml-auto flex shrink-0 items-center gap-2">
      <NchIconButton
        :label="t('session_actions.menu.clear')"
        variant="outline"
        :disabled="!canClear"
        class="motion-press touch-manipulation hover:border-critical/60 hover:text-critical"
        @click="clear"
      >
        <Trash2 aria-hidden="true" />
      </NchIconButton>
      <Button
        class="motion-press touch-manipulation font-semibold hover:bg-primary/85"
        :aria-label="t('overview.open_label', { title })"
        @click="emit('open')"
      >
        <SquareArrowOutUpRight aria-hidden="true" />
        {{ t('overview.card.to_chat') }}
      </Button>
    </div>
  </div>
</template>
