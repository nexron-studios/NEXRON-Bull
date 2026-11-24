<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Check } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useCopyHintStore } from '@/stores/copyHint'

// The quiet confirmation of copy on select: a small "Kopiert" just above where the pointer let
// go, fading in and out. Screen readers hear it once through the status line.
const { t } = useI18n()
const { hint } = storeToRefs(useCopyHintStore())

// A live region speaks only when its text changes: emptied first, a second copy within the
// hint's time is announced again.
const announcement = ref('')
watch(
  () => hint.value?.id,
  async (id) => {
    announcement.value = ''
    if (id === undefined) return
    await nextTick()
    announcement.value = t('chat.copied')
  }
)
</script>

<template>
  <Transition name="fade">
    <div
      v-if="hint"
      :key="hint.id"
      class="pointer-events-none fixed z-100 flex -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] items-center gap-1 rounded-md border bg-popover px-2 py-0.5 text-meta text-popover-foreground shadow-md"
      :style="{ left: `${hint.x}px`, top: `${hint.y}px` }"
      aria-hidden="true"
    >
      <Check class="size-3 text-good" aria-hidden="true" />
      {{ t('chat.copied') }}
    </div>
  </Transition>
  <span class="sr-only" role="status">{{ announcement }}</span>
</template>
