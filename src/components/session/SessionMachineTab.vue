<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { Monitor, Server } from '@lucide/vue'
import { useElementSize } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import SessionMachineBadges from '@/components/session/SessionMachineBadges.vue'
import { TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ChatTabState } from '@/utils/chatTab'
import { machineStateOf } from '@/utils/sessionList'

// One segment of the machine switch: name, open tabs, and what is going on there while hidden.
// In a narrow panel the CSS hides the name (`@max-sidebar:sr-only`); then it is the tooltip.
const { value, label, isRemote, tabs, now, isSelected } = defineProps<{
  value: string
  label: string
  isRemote: boolean
  tabs: ChatTabState[]
  now: number
  isSelected: boolean
}>()

const name = useTemplateRef<HTMLElement>('name')

const { t } = useI18n()

// One source for the breakpoint: the CSS. A hidden name is sr-only, one pixel wide.
const { width: nameWidth } = useElementSize(name)
const isNameHidden = computed(() => nameWidth.value < 2)

const state = computed(() => (isSelected ? null : machineStateOf(tabs, now)))
</script>

<template>
  <TabsTrigger :value class="min-w-0 flex-auto gap-2 px-2.5 text-small">
    <!-- The tooltip sits inside the tab: as its trigger it would overwrite the tab's data-state. -->
    <Tooltip :disabled="!isNameHidden">
      <TooltipTrigger as="span" class="flex min-w-0 items-center gap-2">
        <Server v-if="isRemote" aria-hidden="true" />
        <Monitor v-else aria-hidden="true" />
        <span ref="name" class="truncate @max-sidebar:sr-only">{{ label }}</span>
      </TooltipTrigger>
      <TooltipContent>{{ label }}</TooltipContent>
    </Tooltip>
    <SessionMachineBadges
      :state
      :state-label="state ? t(`sidebar.machine_state.${state}`) : ''"
      :count="tabs.length"
    />
  </TabsTrigger>
</template>
