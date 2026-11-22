<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { RotateCcw, TriangleAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import TerminalSkeleton from '@/components/terminal/TerminalSkeleton.vue'
import { Button } from '@/components/ui/button'
import { useTerminalSessions } from '@/composables/useTerminalSessions'
import type { TerminalEntry } from '@/utils/terminalEntry'

// The screen of one terminal. The terminal itself outlives this component: it is moved in on
// mount and out on unmount, its shell and scrollback stay.
// `isCompact`: the phone, where every column of text counts. A bar sits above the screen wherever it
// is shown; below it only on the phone, the key row.
const {
  entry,
  isAutoFocused = false,
  isCompact = false
} = defineProps<{
  entry: TerminalEntry
  isAutoFocused?: boolean
  isCompact?: boolean
}>()

const screen = useTemplateRef<HTMLElement>('screen')
// Only a change seen on screen animates; coming back to a running terminal shows it at once.
const isFadingIn = ref(false)
const isShaking = ref(false)

const { t } = useI18n()
const { sessionOf, fontSize } = useTerminalSessions()
const session = sessionOf(entry)
const status = session.status
useResizeObserver(screen, () => session.fit())

const startingLabel = computed(() =>
  entry.machine ? t('terminal.connecting', { machine: entry.machine }) : t('terminal.loading')
)

defineExpose({ focus: () => session.focus(), session })

watch(
  () => status.value.kind,
  (kind, previous) => {
    isFadingIn.value = kind === 'ready' && previous === 'starting'
    isShaking.value = kind === 'failed'
  }
)

onMounted(() => {
  if (!screen.value) return
  session.attach(screen.value)
  if (isAutoFocused) session.focus()
})
onBeforeUnmount(() => session.detach())
</script>

<template>
  <div
    class="relative min-h-0 min-w-0 flex-1 bg-background py-2"
    :class="isCompact ? 'px-2' : 'pr-1 pl-5'"
  >
    <div class="relative h-full w-full">
      <!-- Always mounted: a live region only speaks when its text changes. -->
      <span class="sr-only" role="status">
        {{ status.kind === 'starting' ? startingLabel : '' }}
      </span>
      <!-- Hidden by opacity, never display:none: xterm needs its real size to fit while starting. -->
      <div
        ref="screen"
        class="h-full w-full"
        :class="status.kind === 'ready' ? { 'motion-fade-in': isFadingIn } : 'opacity-0'"
        @animationend.self="isFadingIn = false"
      />
      <TerminalSkeleton
        v-if="status.kind === 'starting'"
        class="absolute inset-0 overflow-hidden"
        :font-size
      />
      <div
        v-else-if="status.kind === 'failed'"
        class="absolute inset-0 flex bg-background"
        role="alert"
      >
        <NchEmpty
          :icon="TriangleAlert"
          :title="t('terminal.start_failed')"
          :hint="status.message"
          size="sm"
          :class="{ 'motion-shake': isShaking }"
          @animationend="isShaking = false"
        >
          <Button variant="outline" class="motion-press" @click="session.restart()">
            <RotateCcw class="size-4" aria-hidden="true" />
            {{ t('terminal.retry') }}
          </Button>
        </NchEmpty>
      </div>
    </div>
    <NchScrollEdge edge="top" :is-shown="session.scrollEdges.hasMoreAbove" />
    <NchScrollEdge v-if="isCompact" edge="bottom" :is-shown="session.scrollEdges.hasMoreBelow" />
  </div>
</template>
