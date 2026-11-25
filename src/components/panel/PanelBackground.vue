<script setup lang="ts">
import { computed, useId } from 'vue'
import { SquareTerminal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchKbd from '@/components/common/NchKbd.vue'
import PanelFoldedList from '@/components/panel/PanelFoldedList.vue'
import PanelSection from '@/components/panel/PanelSection.vue'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useMinuteClock } from '@/composables/useClock'
import { useFoldedRows } from '@/composables/useFoldedRows'
import { useRowArrivals } from '@/composables/useRowArrivals'
import { useTabInsights } from '@/composables/useTabInsights'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { SIDEBAR_CHORD } from '@/utils/shortcuts'
import { foregroundShellOf } from '@/utils/activity'
import type { ChatTabState } from '@/utils/chatTab'

// Shells Claude left running in the background (`run_in_background`, or sent there with Ctrl+B),
// such as a dev server, the newest on top and folded after five like the other panel lists. Only
// there while one runs, or while a shell runs that Ctrl+B could move.
const { tab, isEntering = false } = defineProps<{
  tab: ChatTabState
  /** Shown in a sheet that just opened: every row enters. */
  isEntering?: boolean
}>()

const EXPANDED_STORAGE_KEY = 'bull.panel.background_expanded'

const { t } = useI18n()
const listId = useId()
const { labelOf } = useShortcutLabels()
const formatAge = useAgeFormat()
const now = useMinuteClock()
const { backgroundShells } = useTabInsights(tab.id)

const canMoveShell = computed(() => foregroundShellOf(tab) !== null)
const rows = computed(() =>
  backgroundShells.value.toReversed().map((shell) => ({
    ...shell,
    age:
      shell.startedAt === null
        ? ''
        : t('activity.shell_running', {
            age: formatAge.value(Math.max(0, now.value.getTime() - shell.startedAt))
          })
  }))
)
const fold = useFoldedRows(rows, EXPANDED_STORAGE_KEY)
const { staggerIndexOf, settle } = useRowArrivals(
  () => fold.shown.value.map((shell) => shell.id),
  isEntering
)

const toggle = () => {
  settle()
  fold.toggle()
}
</script>

<template>
  <PanelSection
    v-if="rows.length || canMoveShell"
    :icon="SquareTerminal"
    :title="t('activity.background')"
  >
    <PanelFoldedList
      v-if="rows.length"
      :is-expanded="fold.isExpanded.value"
      :is-foldable="fold.isFoldable.value"
      :hidden-count="fold.hiddenCount.value"
      :controls="listId"
      @toggle="toggle"
    >
      <TransitionGroup
        :id="listId"
        tag="ul"
        move-class="panel-row-move"
        class="flex flex-col gap-2.5 text-small"
      >
        <li
          v-for="shell in fold.shown.value"
          :key="shell.id"
          class="flex items-center gap-2"
          :class="{ 'motion-stagger': staggerIndexOf(shell.id) !== null }"
          :style="{ '--stagger-index': staggerIndexOf(shell.id) ?? undefined }"
        >
          <SquareTerminal class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <!-- What it is for reads first; the command stays for the one who knows the script. -->
          <span v-if="shell.description" class="flex min-w-0 flex-1 flex-col">
            <span class="truncate">{{ shell.description }}</span>
            <span class="truncate font-mono text-meta text-muted-foreground">
              {{ shell.command }}
            </span>
          </span>
          <span v-else class="min-w-0 flex-1 truncate font-mono text-meta">{{
            shell.command
          }}</span>
          <span v-if="shell.age" class="shrink-0 text-meta text-muted-foreground tabular-nums">
            {{ shell.age }}
          </span>
        </li>
      </TransitionGroup>
    </PanelFoldedList>
    <p
      v-if="canMoveShell"
      class="flex items-center gap-1.5 text-meta text-muted-foreground pointer-coarse:hidden"
    >
      <NchKbd :key-label="labelOf(SIDEBAR_CHORD)" />
      {{ t('activity.background_hint') }}
    </p>
  </PanelSection>
</template>
