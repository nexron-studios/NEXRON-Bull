<script setup lang="ts">
import { onMounted, ref, useId, useTemplateRef } from 'vue'
import { MessageSquarePlus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchKbd from '@/components/common/NchKbd.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useShortcutLabels } from '@/composables/useShortcutLabels'

// The comment on the chosen lines, written in place below them. Ctrl+Enter adds it, Esc cancels
// without closing the review.
const { reference } = defineProps<{ reference: string }>()
const emit = defineEmits<{ submit: [text: string]; cancel: [] }>()

const SUBMIT_CHORD = { modifier: 'command', keys: ['Enter'] } as const

const text = ref('')
const form = useTemplateRef<HTMLFormElement>('form')

const fieldId = useId()
const { t } = useI18n()
const { labelOf } = useShortcutLabels()

const submit = () => {
  const trimmed = text.value.trim()
  if (!trimmed) return
  emit('submit', trimmed)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('cancel')
    return
  }
  if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  submit()
}

const focus = () => form.value?.querySelector('textarea')?.focus()

defineExpose({ focus })

onMounted(focus)
</script>

<template>
  <form
    ref="form"
    class="motion-fade-in mx-2 my-1.5 flex flex-col gap-2 rounded-lg border bg-card p-2 font-sans"
    @submit.prevent="submit"
    @keydown="handleKeydown"
  >
    <label :for="fieldId" class="font-mono text-meta text-muted-foreground">{{
      t('review.comment_label', { reference })
    }}</label>
    <Textarea
      :id="fieldId"
      v-model="text"
      class="min-h-16 text-small"
      :placeholder="t('review.comment_placeholder')"
    />
    <div class="flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" @click="emit('cancel')">
        {{ t('review.comment_cancel') }}
        <NchKbd key-label="Esc" />
      </Button>
      <Button type="submit" size="sm" :disabled="!text.trim()">
        <MessageSquarePlus class="size-4" aria-hidden="true" />
        {{ t('review.comment_add') }}
        <NchKbd :key-label="labelOf(SUBMIT_CHORD)" is-on-brand />
      </Button>
    </div>
  </form>
</template>
