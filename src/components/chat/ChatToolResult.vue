<script setup lang="ts">
import { computed } from 'vue'
import { CornerDownRight, TriangleAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { Block } from '@/types/agentd.type'
import { toDataUrl } from '@/utils/attachments'

const { isError, content } = defineProps<{ isError: boolean; content: Block[] }>()

const { t } = useI18n()

const text = computed(() =>
  content.map((block) => (block.type === 'text' ? block.text : `[${block.type}]`)).join('\n')
)
const images = computed(() =>
  content.filter((block): block is Extract<Block, { type: 'image' }> => block.type === 'image')
)
</script>

<template>
  <details class="rounded-lg border border-border/60">
    <summary
      class="flex cursor-pointer items-center gap-2 px-3 py-1 text-meta text-muted-foreground select-none"
    >
      <TriangleAlert v-if="isError" class="size-4 text-critical" aria-hidden="true" />
      <CornerDownRight v-else class="size-4" aria-hidden="true" />
      {{ isError ? t('chat.tool_error') : t('chat.tool_result') }}
    </summary>
    <pre
      class="max-h-72 overflow-auto border-t border-border/60 px-3 py-2 font-mono text-meta whitespace-pre-wrap text-subtle"
      >{{ text }}</pre>
    <img
      v-for="(image, index) in images"
      :key="index"
      :src="toDataUrl(image.media_type, image.data)"
      alt=""
      class="m-3 max-h-80 rounded-md"
    />
  </details>
</template>
