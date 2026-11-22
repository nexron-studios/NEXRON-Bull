<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import PanelConnectorRow from '@/components/panel/PanelConnectorRow.vue'
import PanelFoldButton from '@/components/panel/PanelFoldButton.vue'
import { useFoldedRows } from '@/composables/useFoldedRows'
import { useRowArrivals } from '@/composables/useRowArrivals'
import { connectorsInOrderOf } from '@/utils/panelStates'
import type { Connector } from '@/utils/tabInsights'

// The reported servers, the ones needing a login or failing first, folded after five rows. It
// replaces the scroll area of its own from 20.11., whose rows all played their entrance again on
// every tab switch.
const { connectors, isEntering } = defineProps<{
  connectors: Connector[]
  /** The list replaces the placeholder right now: every row enters, not only the ones expanded. */
  isEntering: boolean
}>()

const emit = defineEmits<{ signIn: [name: string] }>()

const EXPANDED_STORAGE_KEY = 'bull.panel.connectors_expanded'

const listId = useId()
const { locale } = useI18n()

const collator = computed(
  () => new Intl.Collator(locale.value, { sensitivity: 'base', numeric: true })
)
const ordered = computed(() => connectorsInOrderOf(connectors, collator.value))
const fold = useFoldedRows(ordered, EXPANDED_STORAGE_KEY)
const { staggerIndexOf, settle } = useRowArrivals(
  () => fold.shown.value.map((connector) => connector.name),
  isEntering
)

// The rows on screen have entered by the time of a click: expanded rows start right away
// instead of after them.
const toggle = () => {
  settle()
  fold.toggle()
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <ul :id="listId" class="flex flex-col">
      <PanelConnectorRow
        v-for="connector in fold.shown.value"
        :key="connector.name"
        :connector
        :class="{ 'motion-stagger': staggerIndexOf(connector.name) !== null }"
        :style="{ '--stagger-index': staggerIndexOf(connector.name) ?? undefined }"
        @sign-in="emit('signIn', $event)"
      />
    </ul>
    <PanelFoldButton
      v-if="fold.isFoldable.value"
      :is-expanded="fold.isExpanded.value"
      :hidden-count="fold.hiddenCount.value"
      :controls="listId"
      @toggle="toggle"
    />
  </div>
</template>
