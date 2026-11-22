<script setup lang="ts">
import { computed, type Component } from 'vue'
import { CircleAlert, CircleDashed, LoaderCircle, MessageCircleQuestion } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { TabStatus } from '@/utils/chatTab'

// The status of a running session as a tinted label; icon and word, never the colour alone.
// `question`: Claude finished, and its answer ends on a question for the user.
const { status } = defineProps<{
  status: Extract<TabStatus, 'asking' | 'working' | 'starting'> | 'question'
}>()

const { t } = useI18n()

// Same icons and colours as the status icon in the sidebar.
const LOOK: Record<typeof status, { icon: Component; class: string; iconClass: string }> = {
  asking: { icon: CircleAlert, class: 'bg-critical/12 text-critical', iconClass: '' },
  working: { icon: LoaderCircle, class: 'bg-warning/12 text-warning', iconClass: 'animate-spin' },
  question: { icon: MessageCircleQuestion, class: 'bg-warning/14 text-warning', iconClass: '' },
  starting: {
    icon: CircleDashed,
    class: 'bg-muted text-muted-foreground',
    iconClass: 'animate-spin'
  }
}

const look = computed(() => LOOK[status])
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-meta font-medium"
    :class="look.class"
  >
    <component :is="look.icon" class="size-3.5" :class="look.iconClass" aria-hidden="true" />
    {{ t(`overview.status.${status}`) }}
  </span>
</template>
