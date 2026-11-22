<script setup lang="ts">
import { useId } from 'vue'
import { Circle, CircleDot } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { rewindScopeList, type RewindScope } from '@/utils/rewind'

// What goes back: chat and code, only the chat, only the code (Figma "34"). Code needs a
// checkpoint from before the prompt; without one only the chat is offered.
const { allowed, filesHint } = defineProps<{
  allowed: RewindScope[]
  /** Which files come back, e.g. "tokens.css wie vor der Nachricht" */
  filesHint: string
}>()

const scope = defineModel<RewindScope>({ required: true })

const { t } = useI18n()
const name = useId()

const hintOf = (option: RewindScope) =>
  option === 'both' ? filesHint : t(`rewind.scope_hints.${option}`)
</script>

<template>
  <fieldset class="flex min-w-0 flex-col gap-1.5">
    <legend class="mb-1.5 text-small font-semibold">{{ t('rewind.scope_title') }}</legend>
    <label
      v-for="option in rewindScopeList"
      :key="option"
      class="flex items-center gap-2.5 rounded-lg border border-input px-2.5 py-2 has-checked:border-brand has-checked:bg-brand/7 has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:opacity-50"
      :class="allowed.includes(option) ? 'cursor-pointer' : 'cursor-not-allowed'"
    >
      <input
        v-model="scope"
        type="radio"
        :name
        :value="option"
        :disabled="!allowed.includes(option)"
        class="sr-only"
      />
      <CircleDot v-if="scope === option" class="size-3.5 shrink-0 text-brand" aria-hidden="true" />
      <Circle v-else class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="shrink-0 text-small font-semibold">{{ t(`rewind.scopes.${option}`) }}</span>
      <span class="min-w-0 flex-1 truncate text-meta text-muted-foreground">
        {{ hintOf(option) }}
      </span>
    </label>
    <p v-if="!allowed.includes('code')" class="text-meta text-muted-foreground">
      {{ t('rewind.no_checkpoint') }}
    </p>
  </fieldset>
</template>
