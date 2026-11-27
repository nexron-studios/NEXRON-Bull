<script setup lang="ts">
import { computed } from 'vue'
import { SquareTerminal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchShimmerText from '@/components/common/NchShimmerText.vue'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useMinuteClock } from '@/composables/useClock'
import { useTabInsights } from '@/composables/useTabInsights'
import { useChatStore } from '@/stores/chat'
import { backgroundAgentsOf } from '@/utils/chatTab'

// Above the composer once Claude's turn is over but agents or shells it started still run, so a
// build or a subagent is not mistaken for done (Jonas, 25.11.2026). Each task with how long it
// runs; it leaves the list when it ends, and for an agent Claude's reply follows. Same card, wave
// and shimmer as the thinking bar it follows (Jonas, 25.11.2026), in the working amber and a
// slower wave: something still runs, but Claude itself waits. Agents only count in the title: the
// panel's subagent list already names each one (Jonas, 27.11.2026: listing them here too was
// useless), so the rows are the shells.
const { tabId } = defineProps<{ tabId: string }>()

const SHOWN_TASKS = 3
// The thinking bar's wave, slower: background work is steady, not Claude's busy turn.
const WAVE_HEIGHTS_PX = [6, 11, 15, 9]
const WAVE_STEP_MS = 200
const WAVE_CYCLE_MS = 1600

const { t } = useI18n()
const formatAge = useAgeFormat()
const now = useMinuteClock()
const { runningSubagents, backgroundShells } = useTabInsights(tabId)

// The bar's title says it runs, so each row only says for how long.
const ageOf = (startedAt: number | null): string =>
  startedAt === null ? '' : formatAge.value(Math.max(0, now.value.getTime() - startedAt))

// Only agents the stream's task list names: after a reload the notices of agents that ended are
// gone, and the messages alone would show them as running for ever.
const chat = useChatStore()
const listedAgentIds = computed(() => {
  const tab = chat.tabs.find((candidate) => candidate.id === tabId)
  return new Set(tab ? backgroundAgentsOf(tab).map((task) => task.id) : [])
})
const agents = computed(() =>
  runningSubagents.value.filter(
    (agent) =>
      agent.isBackground && agent.agentId !== null && listedAgentIds.value.has(agent.agentId)
  )
)
const shells = computed(() =>
  backgroundShells.value.map((shell) => ({
    id: shell.id,
    name: shell.description || shell.command,
    age: ageOf(shell.startedAt)
  }))
)
const taskCount = computed(() => agents.value.length + shells.value.length)
const shown = computed(() => shells.value.slice(0, SHOWN_TASKS))
const hiddenCount = computed(() => shells.value.length - shown.value.length)
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-1 opacity-0"
    leave-active-class="transition-opacity duration-100 ease-out"
    leave-to-class="opacity-0"
  >
    <section
      v-if="taskCount"
      class="mb-2 flex flex-col gap-1 rounded-xl border border-border bg-card py-2 pr-3 pl-4"
      :aria-label="t('activity.bar_title')"
    >
      <p class="flex min-w-0 items-center gap-3 text-small">
        <span class="flex h-4 shrink-0 items-end gap-0.5" aria-hidden="true">
          <span
            v-for="(height, index) in WAVE_HEIGHTS_PX"
            :key="index"
            class="w-[3px] wave-bar rounded-full bg-warning"
            :style="{
              height: `${height}px`,
              animationDelay: `${index * WAVE_STEP_MS}ms`,
              animationDuration: `${WAVE_CYCLE_MS}ms`
            }"
          />
        </span>
        <span class="flex min-w-0 items-baseline gap-1.5">
          <NchShimmerText :text="t('activity.bar_title')" class="min-w-0 font-medium" />
          <span class="shrink-0 text-meta text-muted-foreground tabular-nums">
            <span aria-hidden="true">·</span>
            {{ t('activity.bar_count', taskCount) }}
          </span>
          <span
            v-if="agents.length"
            class="hidden min-w-0 shrink-[999] truncate text-meta text-muted-foreground sm:inline"
          >
            <span aria-hidden="true">·</span>
            {{ t('activity.bar_agent_hint', agents.length) }}
          </span>
        </span>
      </p>
      <!-- Rows start under the title, past the wave, as the thinking bar's label does. -->
      <TransitionGroup
        v-if="shells.length"
        tag="ul"
        class="flex flex-col pl-7.5 text-meta"
        enter-active-class="motion-stagger"
        leave-active-class="transition-opacity duration-100 ease-out"
        leave-to-class="opacity-0"
      >
        <li
          v-for="(shell, index) in shown"
          :key="shell.id"
          class="flex min-w-0 items-center gap-2 py-0.5"
          :style="{ '--stagger-index': index }"
        >
          <SquareTerminal class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ shell.name }}</span>
          <span v-if="shell.age" class="shrink-0 text-muted-foreground tabular-nums">
            <span class="sr-only">{{ t('activity.bar_running_for') }}</span>
            {{ shell.age }}
          </span>
        </li>
        <li v-if="hiddenCount" key="more" class="py-0.5 pl-5.5 text-muted-foreground">
          {{ t('activity.bar_more', { n: hiddenCount }) }}
        </li>
      </TransitionGroup>
    </section>
  </Transition>
</template>
