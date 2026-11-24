<script setup lang="ts">
import { ArrowDown } from '@lucide/vue'
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Input } from '@/components/ui/input'
import { useMarkup } from '@/composables/useMarkup'

// The comment on the phone viewer, with the arrow that takes image and comment into the composer
// (Figma "M20"). Under the image while viewing and in the markup sheet; on the stage in both themes.
const { isApplying, describedBy = undefined } = defineProps<{
  isApplying: boolean
  describedBy?: string
}>()
const emit = defineEmits<{ apply: [] }>()

const { t } = useI18n()
const markup = useMarkup()
const id = useId()
</script>

<template>
  <form class="relative" @submit.prevent="emit('apply')">
    <label :for="id" class="sr-only">{{ t('images.comment_title') }}</label>
    <Input
      :id
      v-model="markup.comment.value"
      :placeholder="t('images.comment_placeholder')"
      :aria-describedby="describedBy"
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
</template>
