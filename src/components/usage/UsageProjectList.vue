<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { ProjectShare } from '@/utils/usage'

const { projects } = defineProps<{ projects: ProjectShare[] }>()

/** Columns the list splits into once the page has room, read down like one list. */
const WIDE_COLUMNS = 2

const { t } = useI18n()
const format = useUsageFormat()

const rowsStyle = computed(() => ({
  '--project-rows': `repeat(${Math.ceil(projects.length / WIDE_COLUMNS)}, auto)`
}))
</script>

<template>
  <section class="flex min-w-0 flex-col gap-3.5 rounded-xl border bg-card p-4 sm:p-5">
    <h2 class="text-body font-semibold">{{ t('usage.by_project') }}</h2>
    <ul
      class="grid gap-x-10 gap-y-3 @4xl:grid-flow-col @4xl:grid-cols-2 @4xl:grid-rows-(--project-rows)"
      :style="rowsStyle"
    >
      <li
        v-for="(project, index) in projects"
        :key="project.path ?? ''"
        class="motion-stagger flex flex-col gap-1.5"
        :style="{ '--stagger-index': index }"
      >
        <div class="flex items-baseline justify-between gap-3 text-small">
          <span v-if="project.path === ''" class="min-w-0 truncate text-muted-foreground">
            {{ t('usage.unknown_project') }}
          </span>
          <Tooltip v-else-if="project.path">
            <TooltipTrigger as-child>
              <span class="min-w-0 truncate font-mono" tabindex="0">{{ project.name }}</span>
            </TooltipTrigger>
            <TooltipContent>{{ project.path }}</TooltipContent>
          </Tooltip>
          <span v-else class="min-w-0 truncate text-muted-foreground">
            {{ t('usage.other_projects') }}
          </span>
          <span class="shrink-0 text-muted-foreground tabular-nums">
            {{ format.compact(project.tokens) }} · {{ format.percent(project.share) }}
          </span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            class="h-full rounded-full bg-muted-foreground"
            :style="{ width: `${project.share * 100}%` }"
          />
        </div>
      </li>
    </ul>
  </section>
</template>
