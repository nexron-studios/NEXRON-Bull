<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ChatMarkupPhoneComment from '@/components/chat/ChatMarkupPhoneComment.vue'
import ChatMarkupTools from '@/components/chat/ChatMarkupTools.vue'
import { Checkbox } from '@/components/ui/checkbox'
import { useMarkup } from '@/composables/useMarkup'

// Bottom of the phone markup screen (Figma "M20"): tools, then colours and sizes, then the comment
// with the arrow that takes image and comment into the composer. On the stage in both themes.
// `hasComment` false (an image still in the composer): only the two ways out, no comment.
const { isApplying, hasComment = true } = defineProps<{
  isApplying: boolean
  hasComment?: boolean
}>()
const emit = defineEmits<{ apply: []; send: [] }>()

const { t } = useI18n()
const markup = useMarkup()
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-t-3xl border-t border-stage-foreground/15 bg-stage-foreground/8 px-4 pt-3 pb-safe text-stage-foreground"
  >
    <div class="flex flex-wrap items-center justify-between gap-y-3">
      <ChatMarkupTools is-large />
    </div>
    <ChatMarkupPhoneComment
      :is-applying
      :has-comment
      described-by="markup-apply-hint"
      @apply="emit('apply')"
      @send="emit('send')"
    />
    <div class="flex items-center gap-2 px-1">
      <Checkbox
        id="markup-keep-original-phone"
        v-model="markup.isKeepingOriginal.value"
        class="border-stage-foreground/40"
        :disabled="!markup.strokes.value.length"
      />
      <label for="markup-keep-original-phone" class="text-small text-stage-foreground/80">
        {{ t('images.keep_original') }}
      </label>
    </div>
    <!-- The arrows of the comment field need it; labelled buttons say it themselves. -->
    <p
      v-if="hasComment"
      id="markup-apply-hint"
      class="pb-2 text-center text-meta text-stage-foreground/60"
    >
      {{ t('images.apply_phone_hint') }}
    </p>
  </section>
</template>
