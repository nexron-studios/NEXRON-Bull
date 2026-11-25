<script setup lang="ts">
import type { Component } from 'vue'
import { CircleAlert, CircleCheck, ListX, LoaderCircle, Timer } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BrandClawdMark from '@/components/brand/BrandClawdMark.vue'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import { Button } from '@/components/ui/button'
import type { SessionGroup } from '@/utils/sessionList'

// The heading of one group in the session list. It sticks to the top of the list while its rows
// scroll under it, on the translucent material surface, and casts the list's top edge while stuck.
const {
  group,
  count,
  unseenCount,
  canRemoveAll = false,
  isStuck = false
} = defineProps<{
  group: SessionGroup
  /** Every row of the group, also those not rendered yet */
  count: number
  unseenCount: number
  canRemoveAll?: boolean
  /** Stuck to the top with rows scrolled beneath it */
  isStuck?: boolean
}>()
const emit = defineEmits<{ removeAll: [] }>()

const { t } = useI18n()

// Same icons and colours as the status icon of a row in that group.
const GROUP_LOOK: Record<SessionGroup, { icon: Component; class: string }> = {
  needs: { icon: CircleAlert, class: 'text-critical' },
  running: { icon: LoaderCircle, class: 'text-warning' },
  empty: { icon: BrandClawdMark, class: '' },
  waiting: { icon: Timer, class: 'text-act-read' },
  done: { icon: CircleCheck, class: 'text-good' }
}
</script>

<template>
  <div class="sticky top-0 z-20 flex items-center gap-2 material pt-4 pr-1 pb-1.5 pl-3">
    <h3
      :id="`session-group-${group}`"
      class="flex min-w-0 flex-1 items-center gap-2 text-meta font-medium text-muted-foreground"
    >
      <component
        :is="GROUP_LOOK[group].icon"
        class="size-3.5 shrink-0"
        :class="GROUP_LOOK[group].class"
        aria-hidden="true"
      />
      <span class="truncate">{{ t(`sidebar.groups.${group}`) }}</span>
      <!-- An empty group says so in its own line; a 0 next to it would only repeat that. -->
      <span v-if="count" class="rounded-full bg-muted px-1.5 text-subtle tabular-nums">
        {{ count }}
      </span>
      <span v-if="unseenCount" class="ml-auto shrink-0 font-semibold text-good tabular-nums">
        {{ t('finish.new_count', { n: unseenCount }) }}
      </span>
    </h3>
    <Button
      v-if="canRemoveAll"
      variant="ghost"
      size="xs"
      class="-my-1 shrink-0 text-muted-foreground pointer-coarse:h-9"
      @click="emit('removeAll')"
    >
      <ListX aria-hidden="true" />
      {{ t('session_actions.remove_all') }}
    </Button>
    <NchScrollEdge edge="below" :is-shown="isStuck" />
  </div>
</template>
