<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// A finished chat: its place in the finish order. ① is the newest and, while nobody saw it, the
// only one in the status colour, so the eye finds it first. `isSeen`: only a ring, the tab bar
// keeps the number after the chat was opened.
const {
  rank,
  isLarge = false,
  isSeen = false
} = defineProps<{ rank: number; isLarge?: boolean; isSeen?: boolean }>()

const { t } = useI18n()

const FIRST_CLASS = 'bg-good text-background'
// `border`, not `muted`: the active row and tab are `muted` and would swallow the circle.
const OTHER_CLASS = 'bg-border text-subtle'
const SEEN_CLASS = 'border border-border text-subtle'

const lookOf = (): string => {
  if (isSeen) return SEEN_CLASS
  return rank === 1 ? FIRST_CLASS : OTHER_CLASS
}
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-full leading-none font-bold tabular-nums"
    :class="[isLarge ? 'size-5 text-[0.6875rem]' : 'size-4 text-[0.625rem]', lookOf()]"
    aria-hidden="true"
  >
    {{ rank }}
  </span>
  <span class="sr-only">{{ t(isSeen ? 'finish.rank_seen' : 'finish.rank', { n: rank }) }}</span>
</template>
