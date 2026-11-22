<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronLeft, Ellipsis, Eraser, RotateCcw, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import { Button } from '@/components/ui/button'
import TerminalKeyRow from '@/components/terminal/TerminalKeyRow.vue'
import TerminalView from '@/components/terminal/TerminalView.vue'
import { useTerminalLabels } from '@/composables/useTerminalLabels'
import { useTerminalSessions } from '@/composables/useTerminalSessions'
import { useTerminalStore } from '@/stores/terminals'
import type { TerminalEntry } from '@/utils/terminalEntry'

// A terminal on a phone (Figma "M24"): full screen over the list, with a key row at the bottom.
const { entry } = defineProps<{ entry: TerminalEntry }>()
const emit = defineEmits<{ back: [] }>()

const isMenuOpen = ref(false)

const { t } = useI18n()
const store = useTerminalStore()
const { titleOf, shellLabelOf } = useTerminalLabels()
const { sessionOf } = useTerminalSessions()

const session = computed(() => sessionOf(entry))

const act = (action: () => void) => {
  isMenuOpen.value = false
  action()
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-safe">
    <header class="shrink-0 border-b border-border pt-safe">
      <div class="flex h-14 items-center gap-1 px-1">
        <NchIconButton :label="t('chat.phone.back')" class="size-11 shrink-0" @click="emit('back')">
          <ChevronLeft class="size-5" aria-hidden="true" />
        </NchIconButton>
        <div class="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          <h1 class="text-body font-semibold">{{ t('terminal.title') }}</h1>
          <p class="max-w-full truncate font-mono text-meta text-muted-foreground">
            {{
              t('terminal.phone_subtitle', { title: titleOf(entry), shell: shellLabelOf(entry) })
            }}
          </p>
        </div>
        <NchIconButton
          :label="t('terminal.menu')"
          class="size-11 shrink-0"
          @click="isMenuOpen = true"
        >
          <Ellipsis class="size-5" aria-hidden="true" />
        </NchIconButton>
      </div>
    </header>
    <TerminalView :key="entry.id" :entry is-auto-focused is-compact />
    <TerminalKeyRow :session />
    <NchResponsiveDialog
      v-model:open="isMenuOpen"
      :title="titleOf(entry)"
      :description="entry.cwd || t('terminal.home')"
    >
      <div class="flex flex-col gap-2">
        <Button
          variant="outline"
          class="h-11 w-full touch-manipulation justify-start"
          @click="act(session.clear)"
        >
          <Eraser class="size-4" aria-hidden="true" />
          {{ t('terminal.clear') }}
        </Button>
        <Button
          variant="outline"
          class="h-11 w-full touch-manipulation justify-start"
          @click="act(() => session.restart())"
        >
          <RotateCcw class="size-4" aria-hidden="true" />
          {{ t('terminal.restart') }}
        </Button>
        <Button
          variant="destructive"
          class="h-11 w-full touch-manipulation justify-start"
          @click="act(() => store.close(entry.id))"
        >
          <X class="size-4" aria-hidden="true" />
          {{ t('terminal.close') }}
        </Button>
      </div>
    </NchResponsiveDialog>
  </div>
</template>
