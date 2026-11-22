<script setup lang="ts">
import { computed, ref, useId, type Component } from 'vue'
import { Bot, ChevronDown, ChevronRight, CircleCheck, CircleX, LoaderCircle } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import PanelSubagentAction from '@/components/panel/PanelSubagentAction.vue'
import { formatElapsed } from '@/utils/elapsed'
import { actionSummaryOf, shownActionsOf } from '@/utils/subagentActions'
import type { ToolRun } from '@/utils/tabActivity'
import { subagentDurationOf, type Subagent, type SubagentStatus } from '@/utils/tabInsights'

// One subagent in the panel (Figma "10", `subagentRow`). A running one is open and lists its
// newest actions; a finished one is closed and names how many it took. A click flips either.
const { agent, actions, now } = defineProps<{
  agent: Subagent
  actions: ToolRun[]
  now: number
}>()

const LOOK: Record<SubagentStatus, { icon: Component; class: string }> = {
  running: { icon: LoaderCircle, class: 'text-warning motion-safe:animate-spin' },
  done: { icon: CircleCheck, class: 'text-good' },
  failed: { icon: CircleX, class: 'text-critical' }
}

/** `null` follows the state: open while it runs. */
const isOpenByUser = ref<boolean | null>(null)
const showsAll = ref(false)

const { t } = useI18n()
const listId = useId()

const isRunning = computed(() => agent.status === 'running')
const hasActions = computed(() => actions.length > 0)
const isOpen = computed(() => hasActions.value && (isOpenByUser.value ?? isRunning.value))
const duration = computed(() => {
  const ms = subagentDurationOf(agent, now)
  return ms === null ? null : formatElapsed(ms)
})
const list = computed(() => shownActionsOf(actions, showsAll.value))
const last = computed(() => actions.at(-1) ?? null)
const summary = computed(() => actionSummaryOf(actions))

const toggle = () => {
  isOpenByUser.value = !isOpen.value
}
</script>

<template>
  <li class="flex flex-col gap-1">
    <component
      :is="hasActions ? 'button' : 'div'"
      :type="hasActions ? 'button' : undefined"
      :aria-expanded="hasActions ? isOpen : undefined"
      :aria-controls="isOpen ? listId : undefined"
      class="flex w-full items-center gap-2 rounded-sm text-left outline-none"
      :class="{
        'motion-press hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring': hasActions
      }"
      @click="hasActions && toggle()"
    >
      <component
        :is="LOOK[agent.status].icon"
        class="size-4 shrink-0"
        :class="LOOK[agent.status].class"
        aria-hidden="true"
      />
      <span class="sr-only">{{ t(`panel.subagent_state.${agent.status}`) }}:</span>
      <span
        class="flex shrink-0 items-center gap-1 rounded-sm bg-muted px-1.5 text-meta text-subtle"
      >
        <Bot class="size-3" aria-hidden="true" />{{ agent.agentType }}
      </span>
      <span class="min-w-0 flex-1 truncate">{{ agent.title }}</span>
      <span v-if="duration" class="shrink-0 text-meta text-muted-foreground tabular-nums">
        {{ duration }}
      </span>
      <component
        :is="isOpen ? ChevronDown : ChevronRight"
        v-if="hasActions"
        class="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </component>

    <ul
      v-if="isOpen"
      :id="listId"
      class="ml-1.5 flex flex-col border-l border-border pl-3.5"
      :aria-label="t('panel.subagent_actions', actions.length)"
    >
      <li v-if="list.hiddenCount">
        <button
          type="button"
          class="motion-press rounded-sm py-0.5 text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          @click="showsAll = true"
        >
          {{ t('panel.more_actions', { n: list.hiddenCount }) }}
        </button>
      </li>
      <li v-for="run in list.shown" :key="run.id">
        <PanelSubagentAction :run :now />
      </li>
    </ul>
    <PanelSubagentAction v-else-if="isRunning && last" :run="last" :now class="pl-6" />
    <p v-else-if="hasActions" class="truncate pl-6 font-mono text-meta text-muted-foreground">
      {{ t('panel.subagent_actions', actions.length) }} · {{ summary }}
    </p>
  </li>
</template>
