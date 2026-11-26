<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'
import UpdateBar from '@/components/update/UpdateBar.vue'
import { Button } from '@/components/ui/button'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { formatPercent, updateCardViewOf, type UpdateText } from '@/utils/appUpdateDialog'

// Above the quota in the sidebar (Figma "42d", "42d2"): an update that is still on its way or
// waits for the restart, after its dialog was closed.
const store = useAppUpdateStore()
const { phase } = storeToRefs(store)

const { t, locale } = useI18n()

const view = computed(() => updateCardViewOf(phase.value))
const percent = computed(() =>
  view.value?.ratio == null ? '' : formatPercent(locale.value, view.value.ratio)
)

const textOf = (text: UpdateText) => t(text.key, { ...text.params, percent: percent.value })

const act = () => {
  if (view.value?.action === 'restart') return void store.restart()
  store.openDialog()
}
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-200 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-100 ease-out"
    leave-to-class="opacity-0"
  >
    <section
      v-if="view"
      class="mx-3 mb-3 flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-card p-2.5"
      :aria-label="t('update.card.label')"
    >
      <div class="flex items-center gap-2.5">
        <span class="grid size-7.5 shrink-0 place-items-center rounded-md bg-muted">
          <TriangleAlert v-if="view.isFailed" class="size-4 text-critical" aria-hidden="true" />
          <BrandBullLogo v-else :size="18" />
        </span>
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-small font-medium">{{ textOf(view.title) }}</span>
          <span class="truncate text-meta text-muted-foreground tabular-nums">
            {{ textOf(view.sub) }}
          </span>
        </div>
        <Button
          v-if="view.action"
          :variant="view.action === 'restart' ? 'default' : 'outline'"
          size="sm"
          class="motion-press"
          :class="{
            'bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover':
              view.action === 'restart'
          }"
          @click="act"
        >
          {{ t(`update.card.${view.action}`) }}
        </Button>
      </div>
      <UpdateBar
        v-if="view.ratio !== undefined"
        class="h-1"
        :ratio="view.ratio"
        :label="textOf(view.title)"
      />
    </section>
  </Transition>
</template>
