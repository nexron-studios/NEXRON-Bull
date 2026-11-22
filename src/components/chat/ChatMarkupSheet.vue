<script setup lang="ts">
import { ArrowDown } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ChatMarkupTools from '@/components/chat/ChatMarkupTools.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useMarkup } from '@/composables/useMarkup'

// Bottom of the phone markup screen (Figma "M20"): tools, then colours and sizes, then the comment
// with the arrow that takes image and comment into the composer. On the stage in both themes.
const { isApplying } = defineProps<{ isApplying: boolean }>()
const emit = defineEmits<{ apply: [] }>()

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
    <form class="relative" @submit.prevent="emit('apply')">
      <label for="markup-comment-phone" class="sr-only">{{ t('images.comment_title') }}</label>
      <Input
        id="markup-comment-phone"
        v-model="markup.comment.value"
        :placeholder="t('images.comment_placeholder')"
        aria-describedby="markup-apply-hint"
        enterkeyhint="done"
        class="h-13 rounded-2xl border-stage-foreground/15 bg-stage-foreground/5 pr-14 pl-4 text-base text-stage-foreground placeholder:text-stage-foreground/50"
      />
      <NchIconButton
        type="submit"
        :label="t('images.apply')"
        :disabled="!markup.isDirty.value"
        :aria-busy="isApplying"
        class="absolute top-1/2 right-1.5 size-10 -translate-y-1/2 rounded-full bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover hover:text-brand-foreground"
      >
        <ArrowDown class="size-5" aria-hidden="true" />
      </NchIconButton>
    </form>
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
    <p id="markup-apply-hint" class="pb-2 text-center text-meta text-stage-foreground/60">
      {{ t('images.apply_phone_hint') }}
    </p>
  </section>
</template>
