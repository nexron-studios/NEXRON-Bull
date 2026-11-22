<script setup lang="ts">
import { ref, useId } from 'vue'
import { Archive } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// "Jetzt zusammenfassen" with an optional focus, which becomes `/compact <focus>`.
const emit = defineEmits<{ compact: [focus: string] }>()

const focus = ref('')

const { t } = useI18n()
const fieldId = useId()

const submit = () => emit('compact', focus.value.trim())
</script>

<template>
  <form class="flex flex-col gap-1.5 border-t border-border pt-2" @submit.prevent="submit">
    <label :for="fieldId" class="text-small font-semibold">{{ t('context.compact_title') }}</label>
    <Input
      :id="fieldId"
      v-model="focus"
      name="compact-focus"
      autocomplete="off"
      class="h-8 text-base sm:text-small"
      :placeholder="t('context.compact_placeholder')"
    />
    <Button type="submit" size="sm" class="self-end">
      <Archive class="size-4" aria-hidden="true" />
      {{ t('context.compact_submit') }}
    </Button>
  </form>
</template>
