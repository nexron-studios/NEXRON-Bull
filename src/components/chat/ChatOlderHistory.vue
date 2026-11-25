<script setup lang="ts">
import { computed, type Component } from 'vue'
import { ChevronsUp, LoaderCircle, RotateCcw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import type { HistoryState } from '@/utils/chatTab'

// The top of a transcript with more behind it. Older pages load on their own while the reader
// scrolls up (`useOlderHistory`); the button stays for the keyboard and for a page that failed.
// One button in every state at one height: a focused one keeps its focus while the page loads,
// and the messages below do not move when it changes.
const { history } = defineProps<{ history: HistoryState }>()
const emit = defineEmits<{ load: [] }>()

const { t } = useI18n()

interface Look {
  icon: Component
  labelKey: string
  iconClass?: string
}

const IDLE: Look = { icon: ChevronsUp, labelKey: 'chat.load_older' }
const LOOK_OF: Record<HistoryState, Look> = {
  none: IDLE,
  loaded: IDLE,
  loading: {
    icon: LoaderCircle,
    labelKey: 'chat.loading_older',
    iconClass: 'motion-safe:animate-spin'
  },
  failed: { icon: RotateCcw, labelKey: 'chat.load_older_failed', iconClass: 'text-critical' }
}

const look = computed(() => LOOK_OF[history])
const isLoading = computed(() => history === 'loading')

// aria-disabled instead of disabled: a disabled button drops its focus.
const handleClick = () => {
  if (isLoading.value) return
  emit('load')
}
</script>

<template>
  <Button variant="ghost" class="self-center" :aria-disabled="isLoading" @click="handleClick">
    <component :is="look.icon" class="size-4" :class="look.iconClass" aria-hidden="true" />
    {{ t(look.labelKey) }}
  </Button>
</template>
