<script setup lang="ts">
import { ChevronLeft, ChevronRight, Copy, PenLine } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ChatMarkupPhoneComment from '@/components/chat/ChatMarkupPhoneComment.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Button } from '@/components/ui/button'

// Under the image on the black phone viewer (Figma "M19"): paging at the thumb, the comment for
// Claude, then copy and mark. Marking swaps this for the sheet with the drawing tools.
const { index, total, canMark, isApplying } = defineProps<{
  index: number
  total: number
  canMark: boolean
  isApplying: boolean
}>()
const emit = defineEmits<{
  step: [delta: number]
  copy: []
  mark: []
  apply: []
  send: []
}>()

const { t } = useI18n()

// Icon buttons on the black stage: touch size, light icon, a faint light hover.
const ON_STAGE =
  'size-11 text-stage-foreground hover:bg-stage-foreground/10 hover:text-stage-foreground'
</script>

<template>
  <div>
    <nav
      v-if="total > 1"
      class="flex h-12 items-center justify-between px-1"
      :aria-label="t('chat.attachments')"
    >
      <NchIconButton :label="t('chat.previous_image')" :class="ON_STAGE" @click="emit('step', -1)">
        <ChevronLeft class="size-5" aria-hidden="true" />
      </NchIconButton>
      <span class="flex items-center gap-2" aria-hidden="true">
        <span
          v-for="at in total"
          :key="at"
          class="size-1.5 rounded-full bg-stage-foreground"
          :class="at - 1 === index ? 'opacity-100' : 'opacity-40'"
        />
      </span>
      <NchIconButton :label="t('chat.next_image')" :class="ON_STAGE" @click="emit('step', 1)">
        <ChevronRight class="size-5" aria-hidden="true" />
      </NchIconButton>
    </nav>
    <div v-if="canMark" class="px-4 pb-2">
      <ChatMarkupPhoneComment :is-applying @apply="emit('apply')" @send="emit('send')" />
    </div>
    <div class="flex gap-2 px-4 pb-3">
      <Button
        variant="outline"
        class="h-11 flex-1 border-stage-foreground/20 bg-stage-foreground/8 text-body text-stage-foreground hover:bg-stage-foreground/15 hover:text-stage-foreground"
        @click="emit('copy')"
      >
        <Copy aria-hidden="true" />
        {{ t('images.copy_short') }}
      </Button>
      <Button
        v-if="canMark"
        class="h-11 flex-1 bg-brand-strong text-body text-brand-foreground hover:bg-brand-strong-hover"
        @click="emit('mark')"
      >
        <PenLine aria-hidden="true" />
        {{ t('images.mark') }}
      </Button>
    </div>
  </div>
</template>
