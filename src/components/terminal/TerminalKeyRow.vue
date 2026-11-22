<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TerminalSession } from '@/lib/terminalSession'
import { KEY_ROW, type KeyRowKey } from '@/utils/terminal'

// Keys a phone keyboard lacks, above it (Figma "M24"). Ctrl stays pressed for the next key typed.
const { session } = defineProps<{ session: TerminalSession }>()

const isCtrlArmed = ref(false)

const { t } = useI18n()

const press = (key: KeyRowKey) => {
  if (key.sequence === null) {
    isCtrlArmed.value = true
    session.armCtrl(() => (isCtrlArmed.value = false))
    return
  }
  session.type(key.sequence)
  session.focus()
}
</script>

<template>
  <div
    class="flex shrink-0 scrollbar-none gap-1.5 overflow-x-auto border-t border-border bg-card px-2.5 pt-2 pb-safe"
    role="toolbar"
    :aria-label="t('terminal.key_row')"
  >
    <button
      v-for="key in KEY_ROW"
      :key="key.label"
      type="button"
      class="min-h-11 min-w-11 shrink-0 touch-manipulation rounded-lg bg-muted px-2.5 font-mono text-meta text-foreground"
      :class="{ 'ring-2 ring-brand': key.sequence === null && isCtrlArmed }"
      :aria-label="key.label === key.name ? undefined : key.name"
      :aria-pressed="key.sequence === null ? isCtrlArmed : undefined"
      @pointerdown.prevent
      @click="press(key)"
    >
      {{ key.label }}
    </button>
  </div>
</template>
