<script setup lang="ts">
// Every toast carries the app icon, so it reads as Bull talking. A typed toast keeps its meaning
// as a small badge on the tile's corner, the way the system badges an app icon.
import type { Component } from 'vue'
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from '@lucide/vue'
import BrandAppIcon from '@/components/brand/BrandAppIcon.vue'

export type ToastIconStatus = 'success' | 'info' | 'warning' | 'error' | 'loading'

interface Badge {
  icon: Component
  class: string
}

const BADGES: Record<ToastIconStatus, Badge> = {
  success: { icon: CircleCheckIcon, class: 'text-good' },
  info: { icon: InfoIcon, class: 'text-muted-foreground' },
  warning: { icon: TriangleAlertIcon, class: 'text-warning' },
  error: { icon: OctagonXIcon, class: 'text-critical' },
  loading: { icon: Loader2Icon, class: 'animate-spin text-muted-foreground' }
}

const { status } = defineProps<{ status?: ToastIconStatus }>()
</script>

<template>
  <span class="relative block size-full">
    <BrandAppIcon />
    <span
      v-if="status"
      class="absolute -end-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-popover"
    >
      <component :is="BADGES[status].icon" class="size-3.5" :class="BADGES[status].class" />
    </span>
  </span>
</template>
