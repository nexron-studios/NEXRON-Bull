<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  tokenFormatterOf,
  widthPercentOf,
  type ContextGroup,
  type ContextReport
} from '@/utils/contextUsage'

// What fills the context as a stacked bar and the same parts as rows (Figma "35"). The reserve
// Claude keeps for writing a summary is hatched; what is left stays the bar's own track, in the
// colour of the "free" row: muted equals the popover in dark mode and hid how long the bar is.
const { report } = defineProps<{ report: ContextReport }>()

const GROUP_CLASS: Record<ContextGroup, string> = {
  system_prompt: 'bg-muted-foreground',
  tools: 'bg-act-read',
  mcp: 'bg-act-outside',
  memory: 'bg-act-change',
  skills: 'bg-clawd',
  agents: 'bg-act-change/50',
  messages: 'bg-brand',
  other: 'bg-muted-foreground/50'
}
// Its own base under the stripes: on the input-coloured track, bare stripes would read as free.
const BUFFER_CLASS =
  'bg-muted bg-[repeating-linear-gradient(45deg,var(--color-input)_0_3px,transparent_3px_6px)]'

const { t, locale } = useI18n()

const formatTokens = computed(() => tokenFormatterOf(locale.value))

const widthOf = (tokens: number) => `${widthPercentOf(tokens, report.window)}%`
</script>

<template>
  <div class="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-input" aria-hidden="true">
    <span
      v-for="share in report.shares"
      :key="share.group"
      :class="GROUP_CLASS[share.group]"
      :style="{ width: widthOf(share.tokens) }"
    />
    <span v-if="report.buffer" :class="BUFFER_CLASS" :style="{ width: widthOf(report.buffer) }" />
  </div>
  <ul class="flex flex-col gap-1 text-small">
    <li v-for="share in report.shares" :key="share.group" class="flex items-center gap-2">
      <span class="size-2 shrink-0 rounded-full" :class="GROUP_CLASS[share.group]" />
      <span class="min-w-0 flex-1 truncate">{{ t(`context.groups.${share.group}`) }}</span>
      <span class="font-mono text-meta tabular-nums">{{ formatTokens(share.tokens) }}</span>
    </li>
    <li v-if="report.buffer" class="flex items-center gap-2 text-muted-foreground">
      <span class="size-2 shrink-0 rounded-full" :class="BUFFER_CLASS" />
      <span class="min-w-0 flex-1 truncate">{{ t('context.buffer') }}</span>
      <span class="font-mono text-meta tabular-nums">{{ formatTokens(report.buffer) }}</span>
    </li>
    <li class="flex items-center gap-2 text-muted-foreground">
      <span class="size-2 shrink-0 rounded-full bg-input" />
      <span class="min-w-0 flex-1 truncate">{{ t('context.free') }}</span>
      <span class="font-mono text-meta tabular-nums">{{ formatTokens(report.free) }}</span>
    </li>
  </ul>
</template>
