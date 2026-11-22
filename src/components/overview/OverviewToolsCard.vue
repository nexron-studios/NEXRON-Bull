<script setup lang="ts">
import { computed } from 'vue'
import { CircleAlert, Wrench } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import { Skeleton } from '@/components/ui/skeleton'
import OverviewBarRow from '@/components/overview/OverviewBarRow.vue'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { RECENT_DAYS, TOP_TOOL_COUNT, type ToolActivity } from '@/utils/activityGrid'
import { TOOL_ICON, TOOL_KIND_CLASS } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// Figma "39 Übersicht": which tools Claude reached for in the last month. The icon keeps the
// colour of its kind, as on the tool rows in the chat; the bars stay neutral.
const { tools } = defineProps<{ tools: ToolActivity[]; isPending: boolean; isError: boolean }>()

const SKELETON_ROWS = 6

const { t } = useI18n()
const format = useUsageFormat()

// The header counts every call; the list shows the most used tools only.
const shown = computed(() => tools.slice(0, TOP_TOOL_COUNT))
const biggest = computed(() => tools[0]?.calls ?? 0)
const total = computed(() => tools.reduce((sum, tool) => sum + tool.calls, 0))
const lookOf = (tool: string) => {
  const info = toolInfoOf(tool)
  return { icon: TOOL_ICON[info.icon], class: TOOL_KIND_CLASS[info.kind] }
}
</script>

<template>
  <section
    class="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    aria-labelledby="overview-tools"
  >
    <header class="flex flex-col gap-0.5">
      <h2 id="overview-tools" class="flex items-center gap-2 text-body font-semibold">
        <Wrench class="size-4 text-muted-foreground" aria-hidden="true" />
        {{ t('overview.activity.tools_title') }}
      </h2>
      <!-- The count is only true once the calls arrived; until then it waits as a skeleton. -->
      <Skeleton v-if="isPending" class="h-5 w-56 max-w-full" />
      <p v-else-if="!isError" class="motion-fade-in text-small text-muted-foreground">
        {{
          t('overview.activity.tool_calls', { n: format.exact(total), days: RECENT_DAYS }, total)
        }}
      </p>
    </header>
    <ul v-if="isPending" class="flex flex-col gap-3" aria-hidden="true">
      <Skeleton v-for="row in SKELETON_ROWS" :key="row" class="h-5" />
    </ul>
    <NchEmpty
      v-else-if="isError"
      :icon="CircleAlert"
      size="sm"
      :title="t('overview.activity.error_title')"
      :hint="t('overview.activity.error_hint')"
      class="motion-shake flex-1"
    />
    <ul v-else-if="tools.length" class="flex flex-col gap-3">
      <OverviewBarRow
        v-for="(tool, index) in shown"
        :key="tool.tool"
        class="motion-stagger"
        :style="{ '--stagger-index': index }"
        :share="biggest ? tool.calls / biggest : 0"
        :value="format.exact(tool.calls)"
      >
        <component
          :is="lookOf(tool.tool).icon"
          class="size-4 shrink-0"
          :class="lookOf(tool.tool).class"
          aria-hidden="true"
        />
        <span class="truncate">{{ tool.label }}</span>
      </OverviewBarRow>
    </ul>
    <NchEmpty
      v-else
      :icon="Wrench"
      size="sm"
      :title="t('overview.activity.tools_empty')"
      :hint="t('overview.activity.recent_empty_hint', { n: RECENT_DAYS })"
      class="flex-1"
    />
  </section>
</template>
