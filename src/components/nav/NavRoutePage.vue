<script setup lang="ts">
import { useTemplateRef, type ComponentPublicInstance } from 'vue'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import { useScrollEdges } from '@/composables/useScrollEdges'

// A page of the shell (overview, usage, settings). Each page's root is its scroll area, and the
// shell's bar casts its edge over it.
// Attributes go to the page itself, so its safe-area padding stays inside the scroll area.
defineOptions({ inheritAttrs: false })

const { edge } = defineProps<{
  /** Where the shell's bar sits: the tab bar on top, or the phone's bottom nav */
  edge: 'top' | 'bottom'
}>()
const emit = defineEmits<{ new: [] }>()

const page = useTemplateRef<ComponentPublicInstance>('page')

// `$el` is a text node when a page renders a fragment; such a page has no scroll area to watch.
const { hasMoreAbove, hasMoreBelow } = useScrollEdges(() => {
  const root: unknown = page.value?.$el
  return root instanceof HTMLElement ? root : null
})
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <RouterView v-slot="{ Component }">
      <component :is="Component" ref="page" v-bind="$attrs" data-route-content @new="emit('new')" />
    </RouterView>
    <NchScrollEdge :edge :is-shown="edge === 'top' ? hasMoreAbove : hasMoreBelow" />
  </div>
</template>
