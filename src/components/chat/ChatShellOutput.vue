<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronUp } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { outputTailOf } from '@/utils/toolOutput'

// A shell's output stays short (Figma "30"): its last lines, the ones before one click away.
const { text, isError = false } = defineProps<{ text: string; isError?: boolean }>()

const isWhole = ref(false)

const { t } = useI18n()

const tail = computed(() => outputTailOf(text))
const shown = computed(() =>
  isWhole.value ? text.replace(/\n+$/, '') : tail.value.lines.join('\n')
)
</script>

<template>
  <div class="flex flex-col gap-1 px-3 py-2">
    <button
      v-if="tail.hidden"
      type="button"
      class="flex w-fit items-center gap-1 rounded-sm text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      :aria-expanded="isWhole"
      @click="isWhole = !isWhole"
    >
      <component :is="isWhole ? ChevronDown : ChevronUp" class="size-3.5" aria-hidden="true" />
      {{ isWhole ? t('chat.output_less') : t('chat.output_before', tail.hidden) }}
    </button>
    <pre
      class="max-h-96 overflow-auto font-mono text-meta whitespace-pre-wrap"
      :class="isError ? 'text-critical' : 'text-subtle'"
      >{{ shown }}</pre>
  </div>
</template>
