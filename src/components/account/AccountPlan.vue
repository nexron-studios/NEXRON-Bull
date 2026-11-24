<script setup lang="ts">
import { cva } from 'class-variance-authority'
import { planToneOf } from '@/utils/quota'

// An account's subscription (`Pro`, `Max`, `Ultra`) as a small pill, tinted by its tier.
defineProps<{ plan: string }>()

// Neutral is a shade off muted, so the pill keeps its shape on a muted chip or row too.
const pillVariants = cva('shrink-0 rounded-md px-1.5 text-meta leading-5 font-medium', {
  variants: {
    tone: {
      pro: 'bg-plan-pro/15 text-plan-pro',
      max: 'bg-plan-max/15 text-plan-max',
      ultra: 'bg-plan-ultra/15 text-plan-ultra',
      neutral: 'bg-foreground/10 text-muted-foreground'
    }
  }
})
</script>

<template>
  <span :class="pillVariants({ tone: planToneOf(plan) })">{{ plan }}</span>
</template>
