<script setup lang="ts">
import { useId } from 'vue'
import PanelFoldedList from '@/components/panel/PanelFoldedList.vue'
import { ListChecks } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Checkbox } from '@/components/ui/checkbox'
import PanelSection from '@/components/panel/PanelSection.vue'
import { useFoldedRows } from '@/composables/useFoldedRows'
import { useOpenItems } from '@/composables/useOpenItems'
import { useRowArrivals } from '@/composables/useRowArrivals'
import type { ChatTabState } from '@/utils/chatTab'

// The "Offen" points (`> [!todo]`) of the answer to the last prompt, in one list to tick off
// (Figma 38b), folded after five like the other panel lists. Only there once that answer had one.
const { tab } = defineProps<{ tab: ChatTabState }>()

const EXPANDED_STORAGE_KEY = 'bull.panel.open_items_expanded'

const { t } = useI18n()
const idPrefix = useId()
const listId = useId()
const { items, openCount, toggle } = useOpenItems(() => tab)
const fold = useFoldedRows(items, EXPANDED_STORAGE_KEY)
const { staggerIndexOf, settle } = useRowArrivals(() => fold.shown.value.map((item) => item.text))

const toggleFold = () => {
  settle()
  fold.toggle()
}
</script>

<template>
  <PanelSection v-if="items.length" :icon="ListChecks" :title="t('panel.open_items')">
    <template #aside>
      <span class="text-meta text-muted-foreground tabular-nums">
        {{ t('panel.open_items_count', { open: openCount, all: items.length }) }}
      </span>
    </template>
    <PanelFoldedList
      :is-expanded="fold.isExpanded.value"
      :is-foldable="fold.isFoldable.value"
      :hidden-count="fold.hiddenCount.value"
      :controls="listId"
      @toggle="toggleFold"
    >
      <ul :id="listId" class="flex flex-col gap-2.5 text-small">
        <li
          v-for="(item, index) in fold.shown.value"
          :key="item.text"
          class="flex items-start gap-2"
          :class="{ 'motion-stagger': staggerIndexOf(item.text) !== null }"
          :style="{ '--stagger-index': staggerIndexOf(item.text) ?? undefined }"
        >
          <Checkbox
            :id="`${idPrefix}-${index}`"
            :model-value="item.isDone"
            class="motion-press mt-0.5"
            @update:model-value="toggle(item)"
          />
          <label
            :for="`${idPrefix}-${index}`"
            class="min-w-0 flex-1 cursor-pointer break-words"
            :class="{ 'text-muted-foreground line-through': item.isDone }"
          >
            {{ item.text }}
          </label>
        </li>
      </ul>
    </PanelFoldedList>
  </PanelSection>
</template>
