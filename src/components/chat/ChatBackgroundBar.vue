<script setup lang="ts">
import { computed } from 'vue'
import { Bot, SquareTerminal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useMinuteClock } from '@/composables/useClock'
import { useTabInsights } from '@/composables/useTabInsights'

// Above the composer once Claude's turn is over but agents or shells it started still run, so a
// build or a subagent is not mistaken for done (Jonas, 25.11.2026). Each task with how long it
// runs; it leaves the list when it ends, and for an agent Claude's reply follows.
const { tabId } = defineProps<{ tabId: string }>()

const SHOWN_TASKS = 3

const { t } = useI18n()
const formatAge = useAgeFormat()
const now = useMinuteClock()
const { runningSubagents, backgroundShells } = useTabInsights(tabId)

const ageOf = (startedAt: number | null): string =>
  startedAt === null
    ? ''
    : t('activity.shell_running', {
        age: formatAge.value(Math.max(0, now.value.getTime() - startedAt))
      })

const agents = computed(() => runningSubagents.value.filter((agent) => agent.isBackground))
const tasks = computed(() => [
  ...agents.value.map((agent) => ({
    id: agent.id,
    icon: Bot,
    iconClass: 'text-warning',
    name: `${agent.agentType} · ${agent.title}`,
    age: ageOf(agent.startedAt)
  })),
  ...backgroundShells.value.map((shell) => ({
    id: shell.id,
    icon: SquareTerminal,
    iconClass: 'text-muted-foreground',
    name: shell.description || shell.command,
    age: ageOf(shell.startedAt)
  }))
])
const shown = computed(() => tasks.value.slice(0, SHOWN_TASKS))
const hiddenCount = computed(() => tasks.value.length - shown.value.length)
</script>

<template>
  <section
    v-if="tasks.length"
    class="mb-2 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-meta"
    :aria-label="t('activity.bar_title')"
  >
    <p class="flex items-center gap-2 text-muted-foreground">
      <span
        class="size-1.5 shrink-0 rounded-full bg-warning motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <span class="min-w-0 truncate font-medium text-foreground">
        {{ t('activity.bar_title') }}
      </span>
      <span v-if="agents.length" class="min-w-0 truncate">
        · {{ t('activity.bar_agent_hint', agents.length) }}
      </span>
    </p>
    <ul class="mt-1 flex flex-col gap-1">
      <li v-for="task in shown" :key="task.id" class="flex min-w-0 items-center gap-2">
        <component
          :is="task.icon"
          class="size-3.5 shrink-0"
          :class="task.iconClass"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate">{{ task.name }}</span>
        <span v-if="task.age" class="shrink-0 text-muted-foreground tabular-nums">
          {{ task.age }}
        </span>
      </li>
      <li v-if="hiddenCount" class="pl-5.5 text-muted-foreground">
        {{ t('activity.bar_more', { n: hiddenCount }) }}
      </li>
    </ul>
  </section>
</template>
