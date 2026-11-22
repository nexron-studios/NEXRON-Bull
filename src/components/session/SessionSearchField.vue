<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'

// The session search of sidebar and phone header. It only exists while searching, so it takes
// the focus when it appears; Esc asks the owner to close it.
const { hasIcon = false } = defineProps<{
  /** A magnifier inside the field, where no search button sits next to it */
  hasIcon?: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const query = defineModel<string>({ required: true })

const input = useTemplateRef<InstanceType<typeof Input>>('input')

const { t } = useI18n()

onMounted(() => {
  ;(input.value?.$el as HTMLInputElement | undefined)?.focus()
})
</script>

<template>
  <div class="relative min-w-0 flex-1">
    <Search
      v-if="hasIcon"
      class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
    <Input
      ref="input"
      v-model="query"
      type="search"
      name="session-search"
      autocomplete="off"
      :class="{ 'h-10 pl-9': hasIcon }"
      :aria-label="t('sidebar.search')"
      :placeholder="t('sidebar.search_placeholder')"
      @keydown.esc="emit('close')"
    />
  </div>
</template>
