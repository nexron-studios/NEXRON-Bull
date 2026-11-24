<script setup lang="ts">
import { ArrowDown } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMarkup } from '@/composables/useMarkup'

// Under the desktop preview (Figma "20b"): what Claude should change, and the way into the
// composer, in the same dialog as the image. Ready while viewing too; marking only adds the tools.
// Nothing is sent from here.
const { isMarking, isApplying } = defineProps<{ isMarking: boolean; isApplying: boolean }>()
const emit = defineEmits<{ discard: []; apply: [] }>()

const { t } = useI18n()
const markup = useMarkup()
</script>

<template>
  <section
    aria-labelledby="markup-comment-title"
    class="flex flex-col gap-2 rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
  >
    <Label id="markup-comment-title" for="markup-comment" class="sr-only">
      {{ t('images.comment_title') }}
    </Label>
    <Textarea
      id="markup-comment"
      v-model="markup.comment.value"
      :placeholder="t('images.comment_placeholder')"
      aria-describedby="markup-comment-hint"
      class="max-h-28 min-h-13 resize-none text-small"
    />
    <p id="markup-comment-hint" class="sr-only">{{ t('images.comment_hint') }}</p>
    <div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <div v-if="isMarking" class="mr-auto flex items-center gap-2">
        <Checkbox
          id="markup-keep-original"
          v-model="markup.isKeepingOriginal.value"
          :disabled="!markup.strokes.value.length"
        />
        <Label for="markup-keep-original" class="text-small text-secondary-foreground">
          {{ t('images.keep_original') }}
        </Label>
      </div>
      <div class="flex gap-1.5">
        <Button variant="outline" size="sm" @click="emit('discard')">
          {{ t('images.discard') }}
        </Button>
        <Button
          size="sm"
          class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
          :disabled="!markup.isDirty.value"
          :aria-busy="isApplying"
          @click="emit('apply')"
        >
          <ArrowDown aria-hidden="true" />
          {{ t('images.apply') }}
        </Button>
      </div>
    </div>
  </section>
</template>
