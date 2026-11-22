<script setup lang="ts">
import { MonitorUp, Plus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

// The place of the next machine, beside the ones there are: as tall as a machine card, so the row
// reads as one set, with the step that fills it. Alone in its row it spans it as one strip instead
// of leaving half the row empty.
const { isAlone = false } = defineProps<{ isAlone?: boolean }>()

const emit = defineEmits<{ connect: [] }>()

const { t } = useI18n()
</script>

<template>
  <article
    class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-6 text-center"
    :class="isAlone && '@3xl:flex-row @3xl:gap-4 @3xl:py-4 @3xl:text-left'"
    aria-labelledby="machine-add-title"
  >
    <span class="grid size-10 place-items-center rounded-lg bg-muted">
      <MonitorUp class="size-5 text-muted-foreground" aria-hidden="true" />
    </span>
    <div class="flex max-w-xs flex-col gap-1" :class="isAlone && '@3xl:max-w-none @3xl:flex-1'">
      <h2 id="machine-add-title" class="font-semibold">
        {{ t('settings.machines.add_card.title') }}
      </h2>
      <p class="text-small text-muted-foreground">{{ t('settings.machines.add_card.hint') }}</p>
    </div>
    <Button class="motion-press" @click="emit('connect')">
      <Plus class="size-4" aria-hidden="true" />{{ t('settings.machines.add_card.action') }}
    </Button>
  </article>
</template>
