<script setup lang="ts">
import { computed } from 'vue'
import { Bell, BellOff } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { useNotificationSetting } from '@/composables/useNotificationSetting'

// The bell (Figma "19b"): on, all off, or on but blocked by the system (a warning dot). Classes and
// listeners from a popover or dialog trigger land on the button.
const { t } = useI18n()
const { permission, isOff } = useNotificationSetting()

const state = computed(() => {
  if (isOff.value) return 'off'
  return permission.value === 'blocked' ? 'blocked' : 'on'
})
</script>

<template>
  <NchIconButton
    :label="t(`notifications.bell.${state}`)"
    size="icon-sm"
    class="relative shrink-0"
    :class="state === 'off' ? 'text-muted-foreground' : 'text-foreground'"
  >
    <BellOff v-if="state === 'off'" class="size-4" aria-hidden="true" />
    <Bell v-else class="size-4" aria-hidden="true" />
    <span
      v-if="state === 'blocked'"
      class="absolute top-1 right-1 size-1.5 rounded-full bg-warning"
      aria-hidden="true"
    />
  </NchIconButton>
</template>
