<script setup lang="ts">
import { computed, useId } from 'vue'
import { FileDiff } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import PanelChangedFileRow from '@/components/panel/PanelChangedFileRow.vue'
import PanelFoldedList from '@/components/panel/PanelFoldedList.vue'
import PanelGhostList from '@/components/panel/PanelGhostList.vue'
import PanelSection from '@/components/panel/PanelSection.vue'
import { useChatReveal } from '@/composables/useChatReveal'
import { useFoldedRows } from '@/composables/useFoldedRows'
import { useRowArrivals } from '@/composables/useRowArrivals'
import { useChangedFiles } from '@/composables/useChangedFiles'
import type { ChatTabState } from '@/utils/chatTab'

// The files Claude and its subagents changed in this chat, the latest first, with their lines
// summed over every change (21.11.2026: the room below the connectors). Folded after five
// like the connectors; before the first change, ghost rows hold about its height. Counts what the
// loaded part of the chat holds.
const { tab, isEntering = false } = defineProps<{
  tab: ChatTabState
  /** Shown in a sheet that just opened: every row enters. */
  isEntering?: boolean
}>()
/** The chat came into view; the phone sheet closes on it. */
const emit = defineEmits<{ navigate: [] }>()

const EXPANDED_STORAGE_KEY = 'bull.panel.changed_files_expanded'

const listId = useId()
const { t } = useI18n()
const { changedFiles } = useChangedFiles(() => tab)
const { revealTool } = useChatReveal()
const fold = useFoldedRows(changedFiles, EXPANDED_STORAGE_KEY)
const { staggerIndexOf, settle } = useRowArrivals(
  () => fold.shown.value.map((file) => file.key),
  isEntering
)

const totals = computed(() =>
  changedFiles.value.reduce(
    (sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }),
    { added: 0, removed: 0 }
  )
)

const show = async (cardId: string) => {
  emit('navigate')
  await revealTool(cardId)
}
const toggle = () => {
  settle()
  fold.toggle()
}
</script>

<template>
  <PanelSection :icon="FileDiff" :title="t('panel.changed_files')">
    <template v-if="changedFiles.length" #aside>
      <span class="flex gap-1.5 text-meta text-muted-foreground tabular-nums">
        {{ t('panel.changed_files_count', changedFiles.length) }}
        <span class="sr-only">{{ t('chat.diff_counts', totals) }}</span>
        <span class="text-good" aria-hidden="true">+{{ totals.added }}</span>
        <span class="text-critical" aria-hidden="true">−{{ totals.removed }}</span>
      </span>
    </template>
    <PanelFoldedList
      v-if="changedFiles.length"
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
        class="flex flex-col"
        :aria-label="t('panel.changed_files_list')"
      >
        <PanelChangedFileRow
          v-for="file in fold.shown.value"
          :key="file.key"
          :file
          :class="{ 'motion-stagger': staggerIndexOf(file.key) !== null }"
          :style="{ '--stagger-index': staggerIndexOf(file.key) ?? undefined }"
          @open="show(file.cardId)"
        />
      </TransitionGroup>
    </PanelFoldedList>
    <template v-else>
      <PanelGhostList />
      <NchSectionEmpty
        :icon="FileDiff"
        :title="t('panel.changed_files_empty')"
        :hint="t('panel.changed_files_empty_hint')"
      />
    </template>
  </PanelSection>
</template>
