<script setup lang="ts">
import { Clock, Pencil, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import type { HeldPrompt } from '@/stores/heldPrompts'

// Figma 30: what was typed while Claude works, numbered above the composer until the turn ends.
defineProps<{ prompts: HeldPrompt[] }>()
const emit = defineEmits<{ edit: [id: string]; remove: [id: string] }>()

const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-1.5" :aria-label="t('prompt_input.queue_title')">
    <p class="flex items-center gap-1.5 text-meta text-muted-foreground">
      <Clock class="size-3.5" aria-hidden="true" />
      {{ t('prompt_input.queue_title') }}
    </p>
    <ol class="flex flex-col gap-1">
      <li
        v-for="(prompt, index) in prompts"
        :key="prompt.id"
        class="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1 pr-1 pl-3"
      >
        <span
          class="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-meta text-secondary-foreground tabular-nums"
          aria-hidden="true"
        >
          {{ index + 1 }}
        </span>
        <span class="min-w-0 flex-1 truncate text-small">{{ prompt.text }}</span>
        <span v-if="prompt.images.length" class="shrink-0 text-meta text-muted-foreground">
          {{ t('prompt_input.queue_images', { n: prompt.images.length }) }}
        </span>
        <NchIconButton
          :label="t('prompt_input.queue_edit', { n: index + 1 })"
          size="icon-sm"
          class="shrink-0 text-muted-foreground"
          @click="emit('edit', prompt.id)"
        >
          <Pencil class="size-3.5" aria-hidden="true" />
        </NchIconButton>
        <NchIconButton
          :label="t('prompt_input.queue_remove', { n: index + 1 })"
          size="icon-sm"
          class="shrink-0 text-muted-foreground"
          @click="emit('remove', prompt.id)"
        >
          <X class="size-3.5" aria-hidden="true" />
        </NchIconButton>
      </li>
    </ol>
  </section>
</template>
