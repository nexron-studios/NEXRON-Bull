<script setup lang="ts">
import { X } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import TerminalShellIcon from '@/components/terminal/TerminalShellIcon.vue'
import { useTerminalLabels } from '@/composables/useTerminalLabels'
import { useTerminalStore } from '@/stores/terminals'

// Terminal tabs in the tab bar, after the chats (Figma "23"). Same cell as a chat tab, so the
// bar's underline finds them by `data-tab-cell`.
const { activeId } = defineProps<{ activeId: string | null }>()
const emit = defineEmits<{ select: [id: string] }>()

const { t } = useI18n()
const store = useTerminalStore()
const { tabs } = storeToRefs(store)
const { titleOf } = useTerminalLabels()
</script>

<template>
  <div
    v-for="entry in tabs"
    :key="entry.id"
    :data-tab-cell="entry.id"
    class="group flex max-w-60 min-w-0 shrink-0 items-center rounded-lg border"
    :class="
      entry.id === activeId ? 'border-border bg-card' : 'border-transparent hover:bg-muted/60'
    "
  >
    <button
      type="button"
      class="flex min-w-0 items-center gap-2 py-1.5 pr-1 pl-3 text-small"
      :aria-current="entry.id === activeId ? 'page' : undefined"
      @click="emit('select', entry.id)"
    >
      <TerminalShellIcon
        :shell="entry.machine ? null : entry.shell"
        class="size-4 text-muted-foreground"
      />
      <span class="sr-only">{{ t('terminal.tab') }}:</span>
      <span class="truncate" :class="entry.id === activeId ? 'text-foreground' : 'text-subtle'">
        {{ titleOf(entry) }}
      </span>
    </button>
    <NchIconButton
      :label="t('terminal.close')"
      size="icon-xs"
      class="mr-1"
      @click="store.close(entry.id)"
    >
      <X aria-hidden="true" />
    </NchIconButton>
  </div>
</template>
