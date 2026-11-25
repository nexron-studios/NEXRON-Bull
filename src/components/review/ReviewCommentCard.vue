<script setup lang="ts">
import { MessageSquare, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import type { ReviewComment } from '@/utils/diffReview'

// A pending comment below the lines it names, until it goes into the composer.
defineProps<{ comment: ReviewComment }>()
const emit = defineEmits<{ remove: [] }>()

const { t } = useI18n()
</script>

<template>
  <div
    class="motion-fade-in mx-2 my-1 flex items-start gap-2 rounded-lg border border-brand/35 bg-brand/8 py-1.5 pr-1 pl-2.5 font-sans text-small"
  >
    <MessageSquare class="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden="true" />
    <p class="min-w-0 flex-1 break-words whitespace-pre-wrap">
      <span class="font-mono text-meta text-muted-foreground">{{ comment.reference }}</span>
      {{ ' ' }}{{ comment.text }}
    </p>
    <NchIconButton
      :label="t('review.comment_remove', { reference: comment.reference })"
      size="icon-xs"
      class="shrink-0"
      @click="emit('remove')"
    >
      <X class="size-3.5" aria-hidden="true" />
    </NchIconButton>
  </div>
</template>
