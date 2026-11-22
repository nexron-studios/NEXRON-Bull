<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// A finished chat not seen yet: its place in the finish order. ① is the newest and the only one
// in the status colour, so the eye finds it first.
const { rank, isLarge = false } = defineProps<{ rank: number; isLarge?: boolean }>()

const { t } = useI18n()

const FIRST_CLASS = 'bg-good text-background'
// `border`, not `muted`: the active row and tab are `muted` and would swallow the circle.
const OTHER_CLASS = 'bg-border text-subtle'
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-full leading-none font-bold tabular-nums"
    :class="[
      isLarge ? 'size-5 text-[0.6875rem]' : 'size-4 text-[0.625rem]',
      rank === 1 ? FIRST_CLASS : OTHER_CLASS
    ]"
    aria-hidden="true"
  >
    {{ rank }}
  </span>
  <span class="sr-only">{{ t('finish.rank', { n: rank }) }}</span>
</template>
