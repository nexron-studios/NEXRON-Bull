<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import ChatImageChip from '@/components/chat/ChatImageChip.vue'
import ChatImageLightbox from '@/components/chat/ChatImageLightbox.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useDragOptions } from '@/composables/useDragOptions'
import { MAX_IMAGES_PER_MESSAGE } from '@/utils/attachments'
import type { PendingImage } from '@/utils/content'
import { moveStepOf } from '@/utils/shortcuts'

// The images of the next message above its text: drag or Ctrl+Shift+arrows to reorder.
const { readingCount } = defineProps<{ readingCount: number }>()
const emit = defineEmits<{ remove: [id: string]; move: [id: string, step: -1 | 1] }>()

const images = defineModel<PendingImage[]>('images', { required: true })

const thumbs = ref<HTMLElement | null>(null)
const isLightboxOpen = ref(false)
const lightboxIndex = ref(0)

const { t } = useI18n()
const dragOptions = useDragOptions('x')

const openAt = (at: number) => {
  lightboxIndex.value = at
  isLightboxOpen.value = true
}

// Ctrl+Shift+Left/Right is the keyboard way of dragging; focus stays on the moved image.
const handleThumbKeydown = async (event: KeyboardEvent, id: string) => {
  const step = moveStepOf(event)
  if (!step) return
  event.preventDefault()
  emit('move', id, step)
  await nextTick()
  thumbs.value?.querySelector<HTMLElement>(`[data-image-id="${id}"]`)?.focus()
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div ref="thumbs" class="flex flex-wrap gap-2 pt-1.5 pr-1.5">
      <!-- The order here is the order Claude receives the images in. -->
      <VueDraggable
        v-model="images"
        tag="ul"
        class="flex flex-wrap gap-2"
        :aria-label="t('chat.attachments')"
        v-bind="dragOptions"
      >
        <li v-for="(image, at) in images" :key="image.id">
          <ChatImageChip
            :image
            @open="openAt(at)"
            @remove="emit('remove', image.id)"
            @keydown="handleThumbKeydown($event, image.id)"
          />
        </li>
      </VueDraggable>
      <Skeleton
        v-for="n in readingCount"
        :key="`reading-${n}`"
        class="h-9 w-40 rounded-lg"
        aria-hidden="true"
      />
    </div>
    <p class="text-meta text-muted-foreground tabular-nums">
      {{ t('chat.attachment_count', { count: images.length, max: MAX_IMAGES_PER_MESSAGE }) }}
    </p>
    <ChatImageLightbox v-model:open="isLightboxOpen" v-model:index="lightboxIndex" :images />
  </div>
</template>
