<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner'

import { XIcon } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import BrandToastIcon from '@/components/brand/BrandToastIcon.vue'
import { cn } from '@/lib/utils'
import { Toaster as Sonner } from 'vue-sonner'

const props = defineProps<ToasterProps>()
const delegatedProps = reactiveOmit(props, 'class', 'toastOptions')
</script>

<template>
  <Sonner
    :class="cn('toaster group', props.class)"
    :style="{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
      '--border-radius': 'var(--radius)',
      '--gray2': 'hsl(var(--popover) / 0.9)',
      '--gray3': 'var(--border)',
      '--gray4': 'var(--border)',
      '--gray5': 'var(--border)',
      '--gray12': 'var(--popover-foreground)'
    }"
    :toast-options="
      props.toastOptions ?? {
        classes: {
          toast: 'rounded-2xl',
          // Sonner paints the description #3f3f3f unless its own theme is dark, which ours never
          // sets: grey on the dark popover. Its sheet is unlayered, so only `!` beats it.
          description: 'text-muted-foreground!',
          // Room for the bull tile; Sonner's sheet fixes the icon at 16 px, unlayered.
          icon: 'size-8! me-1!'
        }
      }
    "
    v-bind="delegatedProps"
  >
    <template #success-icon>
      <BrandToastIcon status="success" />
    </template>
    <template #info-icon>
      <BrandToastIcon status="info" />
    </template>
    <template #warning-icon>
      <BrandToastIcon status="warning" />
    </template>
    <template #error-icon>
      <BrandToastIcon status="error" />
    </template>
    <template #loading-icon>
      <BrandToastIcon status="loading" />
    </template>
    <template #close-icon>
      <XIcon class="size-4" />
    </template>
  </Sonner>
</template>
