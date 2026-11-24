<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { useUiZoom } from '@/composables/useUiZoom'
import { UI_ZOOM_IN_CHORD, UI_ZOOM_OUT_CHORD, UI_ZOOM_RESET_CHORD } from '@/utils/shortcuts'
import { uiZoomStepList, type UiZoomChoice } from '@/utils/uiZoom'

// How large Bull draws everything. Automatic follows the window, so a 4K screen does not show a
// tiny UI; the fixed steps are for a taste that differs. Only the app window can zoom its page:
// a browser tab has its own zoom, so the choice is not offered there.
const { t, locale } = useI18n()
const { labelOf } = useShortcutLabels()
const { isAvailable, choice, zoom } = useUiZoom()

const percent = computed(() => new Intl.NumberFormat(locale.value, { style: 'percent' }))
const options = computed<{ value: UiZoomChoice; label: string }[]>(() => [
  { value: 'auto', label: t('settings.appearance.zoom_auto') },
  ...uiZoomStepList.map((step) => ({ value: step, label: percent.value.format(step) }))
])
const keys = computed(() => ({
  larger: labelOf(UI_ZOOM_IN_CHORD),
  smaller: labelOf(UI_ZOOM_OUT_CHORD),
  reset: labelOf(UI_ZOOM_RESET_CHORD)
}))
const note = computed(() =>
  choice.value === 'auto' && zoom.value !== null
    ? t('settings.appearance.zoom_note_auto', {
        ...keys.value,
        zoom: percent.value.format(zoom.value)
      })
    : t('settings.appearance.zoom_note', keys.value)
)
</script>

<template>
  <div v-if="isAvailable" class="flex flex-col gap-2">
    <h2 id="settings-zoom" class="text-small font-semibold">
      {{ t('settings.appearance.zoom') }}
    </h2>
    <NchRangeSwitch
      v-model="choice"
      :options
      :label="t('settings.appearance.zoom')"
      class="self-start"
    />
    <p class="max-w-prose text-meta text-muted-foreground">{{ note }}</p>
  </div>
</template>
