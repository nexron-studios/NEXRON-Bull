<script setup lang="ts">
import { computed } from 'vue'
import { FileText, RotateCcw, WandSparkles } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ChatCompactForm from '@/components/chat/ChatCompactForm.vue'
import ChatContextBar from '@/components/chat/ChatContextBar.vue'
import { useContextReport } from '@/composables/useContextReport'
import { useContextUsageStore } from '@/stores/contextUsage'
import { contextLevelOf, loadedRowsOf, tokenFormatterOf } from '@/utils/contextUsage'
import { METER_LEVEL_CLASS } from '@/utils/quota'

// What fills a tab's context, as `/context` shows it in the terminal (Figma "35"): the total, the
// parts, the files and skills Claude loaded, and compacting right there.
const { tabId } = defineProps<{ tabId: string }>()

const SKELETON_ROWS = 6

const { t, locale } = useI18n()
const store = useContextUsageStore()
const report = useContextReport(
  () => tabId,
  () => store.openTabId === tabId
)

const formatTokens = computed(() => tokenFormatterOf(locale.value))
const data = computed(() => report.data.value ?? null)
const totalClass = computed(() =>
  data.value ? METER_LEVEL_CLASS[contextLevelOf(data.value.percent)].text : ''
)
const loadedRows = computed(() => (data.value ? loadedRowsOf(data.value.memoryFiles) : []))
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="flex items-baseline justify-between gap-3">
      <span class="font-semibold">{{ t('context.title') }}</span>
      <span v-if="data" class="text-small tabular-nums" :class="totalClass">
        {{
          t('context.total', {
            tokens: formatTokens(data.tokens),
            window: formatTokens(data.window),
            percent: data.percent
          })
        }}
      </span>
    </div>
    <div v-if="data" class="motion-fade-in flex flex-col gap-2.5">
      <ChatContextBar :report="data" />
      <template v-if="loadedRows.length || data.skills">
        <span class="text-meta font-medium text-muted-foreground">{{ t('context.loaded') }}</span>
        <ul class="flex flex-col gap-1 text-meta">
          <li v-for="row in loadedRows" :key="row.path" class="flex items-center gap-1.5">
            <FileText class="size-3.5 shrink-0 text-act-change" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate font-mono">
              {{
                row.count > 1
                  ? t('context.loaded_folder', { path: row.path, count: row.count })
                  : row.path
              }}
            </span>
            <span class="text-muted-foreground tabular-nums">{{ formatTokens(row.tokens) }}</span>
          </li>
          <li v-if="data.skills" class="flex items-center gap-1.5">
            <WandSparkles class="size-3.5 shrink-0 text-clawd" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate font-mono">
              {{ t('context.loaded_skills', data.skills.count) }}
            </span>
            <span class="text-muted-foreground tabular-nums">
              {{ formatTokens(data.skills.tokens) }}
            </span>
          </li>
        </ul>
      </template>
    </div>
    <div v-else-if="report.isError.value" class="flex flex-col items-start gap-2 text-small">
      <span class="text-muted-foreground">{{ t('context.failed') }}</span>
      <Button variant="outline" size="sm" @click="report.refetch()">
        <RotateCcw class="size-4" aria-hidden="true" />
        {{ t('context.retry') }}
      </Button>
    </div>
    <div v-else class="flex flex-col gap-2" aria-busy="true">
      <Skeleton class="h-2.5 w-full rounded-full" />
      <Skeleton v-for="row in SKELETON_ROWS" :key="row" class="h-4 w-full" />
    </div>
    <ChatCompactForm @compact="store.compact(tabId, $event)" />
  </div>
</template>
