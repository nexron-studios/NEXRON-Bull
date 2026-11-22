<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

interface SkeletonProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<SkeletonProps>()
</script>

<template>
  <!-- Not bg-muted: in the dark theme it equals --popover, so skeletons vanish in popovers and dialogs. -->
  <div data-slot="skeleton" :class="cn('animate-pulse rounded-md bg-foreground/10', props.class)" />
</template>
