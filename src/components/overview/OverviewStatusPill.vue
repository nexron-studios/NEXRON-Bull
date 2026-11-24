<script setup lang="ts">
import { computed, type Component } from 'vue'
import { CircleAlert, CircleDashed, LoaderCircle, MessageCircleQuestion } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { CardStatus } from '@/utils/sessionCard'

// The status of a running session as a tinted, outlined pill like the Agent Dashboard's
// StatusBadge; icon and word, never the colour alone.
const { status } = defineProps<{ status: CardStatus }>()

const { t } = useI18n()

// Same icons and colours as the status icon in the sidebar.
const LOOK: Record<CardStatus, { icon: Component; class: string; iconClass: string }> = {
  asking: {
    icon: CircleAlert,
    class: 'border-critical/40 bg-critical/12 text-critical',
    iconClass: ''
  },
  working: {
    icon: LoaderCircle,
    class: 'border-warning/30 bg-warning/10 text-warning',
    iconClass: 'animate-spin'
  },
  question: {
    icon: MessageCircleQuestion,
    class: 'border-warning/30 bg-warning/12 text-warning',
    iconClass: ''
  },
  starting: {
    icon: CircleDashed,
    class: 'border-border bg-muted text-muted-foreground',
    iconClass: 'animate-spin'
  }
}

const look = computed(() => LOOK[status])
</script>

<template>
  <span
    class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-meta font-semibold whitespace-nowrap"
    :class="look.class"
  >
    <component :is="look.icon" class="size-3.5" :class="look.iconClass" aria-hidden="true" />
    {{ t(`overview.status.${status}`) }}
  </span>
</template>
