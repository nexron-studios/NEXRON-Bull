<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { BackgroundTask } from '@/utils/tabInsights'

// What Claude still runs in the background of a finished chat, as one line: the task's name when
// there is one, else how many. The names of all of them come on hover, since the line truncates.
// The chat itself is done (Jonas, 25.11.2026); a slow pulse beside the line says that something
// of it still works. Reduced motion stops the pulse and keeps the dot.
const { tasks } = defineProps<{ tasks: BackgroundTask[] }>()

const { t } = useI18n()

const names = computed(() => tasks.map((task) => task.description).filter(Boolean))
const label = computed(() => {
  const [only] = tasks
  if (tasks.length === 1 && only.description)
    return t('sidebar.background_task', { task: only.description })
  return t('sidebar.background_count', tasks.length)
})
</script>

<template>
  <span class="flex min-w-0 items-center gap-1.5">
    <span
      class="size-1.5 shrink-0 rounded-full bg-warning motion-safe:animate-pulse"
      aria-hidden="true"
    />
    <span v-if="!names.length" class="min-w-0 truncate">{{ label }}</span>
    <!-- Hover only: the row is one button, so the names go to screen readers as text instead. -->
    <Tooltip v-else>
      <TooltipTrigger as-child>
        <span class="min-w-0 truncate">
          <span aria-hidden="true">{{ label }}</span>
          <span class="sr-only">
            {{ t('sidebar.background_count', tasks.length) }}: {{ names.join(', ') }}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" class="max-w-72 flex-col items-start">
        <p v-for="(name, at) in names" :key="at">{{ name }}</p>
      </TooltipContent>
    </Tooltip>
  </span>
</template>
