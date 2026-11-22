<script setup lang="ts">
import { useId } from 'vue'
import { Switch } from '@/components/ui/switch'

// One on/off setting: what it does, a line on how, and the switch; the whole row toggles it.
defineProps<{ title: string; hint: string }>()

const isOn = defineModel<boolean>({ required: true })

const id = useId()
</script>

<template>
  <div class="flex items-center gap-3">
    <label :for="id" class="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
      <span :id="`${id}-title`" class="text-small">{{ title }}</span>
      <span :id="`${id}-hint`" class="text-meta text-muted-foreground">{{ hint }}</span>
    </label>
    <Switch :id v-model="isOn" :aria-labelledby="`${id}-title`" :aria-describedby="`${id}-hint`" />
  </div>
</template>
