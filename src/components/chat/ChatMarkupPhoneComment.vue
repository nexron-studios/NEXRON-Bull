<script setup lang="ts">
import { ArrowDown, ArrowUp } from '@lucide/vue'
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMarkup } from '@/composables/useMarkup'

// The comment on the phone viewer, with the arrow that takes image and comment into the composer
// (Figma "M20") and, last and filled, the one that sends them as a message of their own. Under the
// image while viewing and in the markup sheet; on the stage in both themes. The keyboard's "done"
// keeps meaning into the composer, where the text can still be changed. `hasComment` false (an
// image still in the composer): only the two ways out, as labelled buttons.
const {
  isApplying,
  hasComment = true,
  describedBy = undefined
} = defineProps<{
  isApplying: boolean
  hasComment?: boolean
  describedBy?: string
}>()
const emit = defineEmits<{ apply: []; send: [] }>()

const { t } = useI18n()
const markup = useMarkup()
const id = useId()
</script>

<template>
  <div v-if="!hasComment" class="flex gap-2">
    <Button
      variant="outline"
      class="h-11 flex-1 border-stage-foreground/20 bg-stage-foreground/8 text-body text-stage-foreground hover:bg-stage-foreground/15 hover:text-stage-foreground"
      :disabled="!markup.isDirty.value"
      :aria-busy="isApplying"
      @click="emit('apply')"
    >
      <ArrowDown aria-hidden="true" />
      {{ t('images.apply') }}
    </Button>
    <Button
      class="h-11 flex-1 bg-brand-strong text-body text-brand-foreground hover:bg-brand-strong-hover"
      :disabled="!markup.isDirty.value"
      :aria-busy="isApplying"
      @click="emit('send')"
    >
      <ArrowUp aria-hidden="true" />
      {{ t('images.send') }}
    </Button>
  </div>
  <form v-else class="relative" @submit.prevent="emit('apply')">
    <label :for="id" class="sr-only">{{ t('images.comment_title') }}</label>
    <Input
      :id
      v-model="markup.comment.value"
      :placeholder="t('images.comment_placeholder')"
      :aria-describedby="describedBy"
      enterkeyhint="done"
      class="h-13 rounded-2xl border-stage-foreground/15 bg-stage-foreground/5 pr-25 pl-4 text-base text-stage-foreground placeholder:text-stage-foreground/50"
    />
    <div class="absolute top-1/2 right-1.5 flex -translate-y-1/2 gap-1">
      <NchIconButton
        type="submit"
        :label="t('images.apply')"
        :disabled="!markup.isDirty.value"
        :aria-busy="isApplying"
        class="size-10 rounded-full bg-stage-foreground/10 text-stage-foreground hover:bg-stage-foreground/20 hover:text-stage-foreground"
      >
        <ArrowDown class="size-5" aria-hidden="true" />
      </NchIconButton>
      <NchIconButton
        :label="t('images.send')"
        :disabled="!markup.isDirty.value"
        :aria-busy="isApplying"
        class="size-10 rounded-full bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover hover:text-brand-foreground"
        @click="emit('send')"
      >
        <ArrowUp class="size-5" aria-hidden="true" />
      </NchIconButton>
    </div>
  </form>
</template>
