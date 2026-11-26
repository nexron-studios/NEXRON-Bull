<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Brain, ChevronDown } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchShimmerText from '@/components/common/NchShimmerText.vue'

// Claude's reasoning as one quiet row, after prompt-kit's Reasoning (MIT). Streaming
// reasoning shows open; finished reasoning folds away behind "Gedacht · 12 s".
const {
  text,
  seconds = null,
  isStreaming = false
} = defineProps<{
  text: string
  seconds?: number | null
  isStreaming?: boolean
}>()

const isOpen = ref(isStreaming)

const { t } = useI18n()
const bodyId = useId()

const label = computed(() => {
  if (isStreaming) return t('chat.stream.thinking')
  return seconds === null ? t('chat.stream.thought') : t('chat.stream.thought_for', { seconds })
})
const hasText = computed(() => !!text.trim())
</script>

<template>
  <div class="flex max-w-[72ch] flex-col gap-1.5">
    <button
      v-if="hasText"
      type="button"
      class="flex w-fit items-center gap-1.5 rounded-sm text-small text-muted-foreground hover:text-foreground"
      :aria-expanded="isOpen"
      :aria-controls="bodyId"
      @click="isOpen = !isOpen"
    >
      <Brain class="size-4 shrink-0" aria-hidden="true" />
      <NchShimmerText :text="label" :is-active="isStreaming" />
      <ChevronDown
        class="size-4 shrink-0 transition-transform duration-200 ease-out"
        :class="{ 'rotate-180': isOpen }"
        aria-hidden="true"
      />
    </button>
    <p v-else class="flex items-center gap-1.5 text-small text-muted-foreground">
      <Brain class="size-4 shrink-0" aria-hidden="true" />
      <NchShimmerText :text="label" :is-active="isStreaming" />
    </p>
    <p
      v-if="hasText"
      v-show="isOpen"
      :id="bodyId"
      class="border-l-2 border-border pl-3 text-small break-words whitespace-pre-wrap text-muted-foreground"
    >
      {{ text }}
    </p>
  </div>
</template>
