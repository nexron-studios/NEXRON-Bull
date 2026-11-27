<script setup lang="ts">
import { computed, ref, useId, type Component } from 'vue'
import { Bot, ChevronDown, ChevronRight, CircleCheck, CircleX, LoaderCircle } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import PanelFoldedList from '@/components/panel/PanelFoldedList.vue'
import PanelSubagentAction from '@/components/panel/PanelSubagentAction.vue'
import { useFoldedRows } from '@/composables/useFoldedRows'
import { formatElapsed } from '@/utils/elapsed'
import { actionSummaryOf } from '@/utils/subagentActions'
import type { ToolRun } from '@/utils/tabActivity'
import { subagentDurationOf, type Subagent, type SubagentStatus } from '@/utils/tabInsights'

// One subagent in the panel (Figma "10", `subagentRow`). A running one is open and lists its
// actions, the newest on top and folded after five (24.11.2026: "+13 weitere" could not be shut
// again); a finished one is closed and names how many it took. A click flips either. Every part
// that comes or goes grows in place (`row-grow`), so the panel never jumps while agents work.
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

const { t } = useI18n()
const listId = useId()

const isRunning = computed(() => agent.status === 'running')
const hasActions = computed(() => actions.length > 0)
const isOpen = computed(() => hasActions.value && (isOpenByUser.value ?? isRunning.value))
const duration = computed(() => {
  const ms = subagentDurationOf(agent, now)
  return ms === null ? null : formatElapsed(ms)
})
const newestFirst = computed(() => actions.toReversed())
const fold = useFoldedRows(newestFirst)
const last = computed(() => actions.at(-1) ?? null)
const summary = computed(() => actionSummaryOf(actions))

const toggle = () => {
  isOpenByUser.value = !isOpen.value
}
</script>

<template>
  <!-- One child for the list's `row-grow`; its `pb-2.5` is the room to the next agent. -->
  <li>
    <div class="flex flex-col pb-2.5">
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

      <!-- Opening, shutting and finishing swap what sits under the title: the old part shrinks
           while the new one grows, so the agents below glide instead of jumping. -->
      <Transition name="row-grow">
        <div v-if="isOpen" key="actions">
          <PanelFoldedList
            class="mt-1 ml-1.5 border-l border-border pl-3.5"
            :is-expanded="fold.isExpanded.value"
            :is-foldable="fold.isFoldable.value"
            :hidden-count="fold.hiddenCount.value"
            :controls="listId"
            @toggle="fold.toggle"
          >
            <TransitionGroup
              :id="listId"
              tag="ul"
              name="row-grow"
              move-class="panel-row-move"
              class="flex flex-col"
              :aria-label="t('panel.subagent_actions', actions.length)"
            >
              <li v-for="run in fold.shown.value" :key="run.id">
                <PanelSubagentAction :run :now />
              </li>
            </TransitionGroup>
          </PanelFoldedList>
        </div>
        <div v-else-if="isRunning && last" key="last">
          <PanelSubagentAction :run="last" :now class="mt-1 pl-6" />
        </div>
        <div v-else-if="hasActions" key="summary">
          <p class="mt-1 truncate pl-6 font-mono text-meta text-muted-foreground">
            {{ t('panel.subagent_actions', actions.length) }} · {{ summary }}
          </p>
        </div>
      </Transition>
    </div>
  </li>
</template>
