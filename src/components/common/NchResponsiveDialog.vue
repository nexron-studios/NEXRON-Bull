<script setup lang="ts">
import { useTemplateRef, type HTMLAttributes } from 'vue'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useScrollEdges } from '@/composables/useScrollEdges'
import { useIsPhone } from '@/composables/useViewport'

// A dialog on wider screens, a bottom sheet on phones (Figma "M10", "M11"): in thumb reach, and
// the screen behind stays visible at the top.
const {
  title,
  description,
  contentClass = '',
  restoresFocus = true
} = defineProps<{
  title: string
  description: string
  /** Classes of the dialog box on wider screens */
  contentClass?: HTMLAttributes['class']
  /** `false` when closing moved focus somewhere else on purpose, so it stays there */
  restoresFocus?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

const sheetBody = useTemplateRef<HTMLElement>('sheetBody')

const isPhone = useIsPhone()
// A long sheet scrolls beneath its title.
const { hasMoreAbove } = useScrollEdges(sheetBody)

const keepFocus = (event: Event) => {
  if (!restoresFocus) event.preventDefault()
}
</script>

<template>
  <Sheet v-if="isPhone" v-model:open="open">
    <SheetContent
      side="bottom"
      :show-close-button="false"
      class="max-h-[85dvh] gap-3 rounded-t-2xl px-4 pt-2 pb-safe"
      @close-auto-focus="keepFocus"
    >
      <span class="mx-auto h-1 w-10 shrink-0 rounded-full bg-input" aria-hidden="true" />
      <SheetHeader class="p-0">
        <SheetTitle class="text-title font-semibold">{{ title }}</SheetTitle>
        <SheetDescription class="text-small">{{ description }}</SheetDescription>
      </SheetHeader>
      <div class="relative -mx-4 flex min-h-0 flex-col">
        <div ref="sheetBody" class="flex min-h-0 flex-col overflow-y-auto px-4">
          <slot />
        </div>
        <NchScrollEdge edge="top" :is-shown="hasMoreAbove" />
      </div>
    </SheetContent>
  </Sheet>
  <Dialog v-else v-model:open="open">
    <!-- One column that never grows past the box: a truncated line inside would otherwise widen
         it to the line's full length and run out of the dialog. -->
    <DialogContent
      class="grid-cols-[minmax(0,1fr)]"
      :class="contentClass"
      @close-auto-focus="keepFocus"
    >
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <slot />
    </DialogContent>
  </Dialog>
</template>
