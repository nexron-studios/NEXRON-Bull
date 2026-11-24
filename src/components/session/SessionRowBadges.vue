<script setup lang="ts">
import { computed } from 'vue'
import { Bot, SquareTerminal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTabInsights } from '@/composables/useTabInsights'

// How many subagents and background shells run in a session (Figma "21", "M22"). A shell can
// outlive the turn, so a finished row shows them too. The id is fixed: the row keys this by its tab.
const { tabId } = defineProps<{ tabId: string }>()

const { t } = useI18n()
const { runningSubagents, backgroundShells } = useTabInsights(tabId)

const badges = computed(() =>
  [
    {
      key: 'agents',
      icon: Bot,
      iconClass: 'text-warning',
      count: runningSubagents.value.length,
      label: t('activity.badge_agents', runningSubagents.value.length),
      items: runningSubagents.value.map((agent) => `${agent.agentType} · ${agent.title}`)
    },
    {
      key: 'shells',
      icon: SquareTerminal,
      iconClass: 'text-muted-foreground',
      count: backgroundShells.value.length,
      label: t('activity.badge_shells', backgroundShells.value.length),
      items: backgroundShells.value.map((shell) => shell.command)
    }
  ].filter((badge) => badge.count > 0)
)
</script>

<template>
  <!-- Hover only: the row is one button, so the names go to screen readers as text instead. -->
  <Tooltip v-if="badges.length">
    <TooltipTrigger as-child>
      <span class="flex shrink-0 items-center gap-1 text-meta text-muted-foreground">
        <span
          v-for="badge in badges"
          :key="badge.key"
          class="flex items-center gap-0.5 rounded-sm bg-muted px-1 tabular-nums"
        >
          <component :is="badge.icon" class="size-3" :class="badge.iconClass" aria-hidden="true" />
          <span aria-hidden="true">{{ badge.count }}</span>
          <span class="sr-only">{{ badge.label }}: {{ badge.items.join(', ') }}</span>
        </span>
      </span>
    </TooltipTrigger>
    <TooltipContent side="right" class="max-w-72 flex-col items-start">
      <p v-for="badge in badges" :key="badge.key">
        <span class="font-medium">{{ badge.label }}:</span> {{ badge.items.join(', ') }}
      </p>
    </TooltipContent>
  </Tooltip>
</template>
