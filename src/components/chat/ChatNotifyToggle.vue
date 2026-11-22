<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import NotificationsBell from '@/components/notifications/NotificationsBell.vue'
import NotificationsPanel from '@/components/notifications/NotificationsPanel.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useNotificationSetting } from '@/composables/useNotificationSetting'
import { useIsPhone } from '@/composables/useViewport'

// The bell opens the notification settings: a popover beside it, or a bottom sheet on a phone.
const isOpen = ref(false)

const { t } = useI18n()
const isPhone = useIsPhone()
const { settings, checkPermission } = useNotificationSetting()

// The user may have changed it in the system settings meanwhile.
watch(isOpen, (isNowOpen) => {
  if (isNowOpen) void checkPermission()
})
// On start too, so a blocked bell shows its dot before anyone opens it.
watch(
  () => settings.value.isOn,
  (isOn) => {
    if (isOn) void checkPermission()
  },
  { immediate: true }
)
</script>

<template>
  <template v-if="isPhone">
    <NotificationsBell aria-haspopup="dialog" @click="isOpen = true" />
    <NchResponsiveDialog
      v-model:open="isOpen"
      :title="t('notifications.title')"
      :description="t('notifications.description')"
    >
      <NotificationsPanel is-phone />
    </NchResponsiveDialog>
  </template>
  <Popover v-else v-model:open="isOpen">
    <PopoverTrigger as-child>
      <NotificationsBell />
    </PopoverTrigger>
    <PopoverContent align="end" :collision-padding="8" class="w-88 gap-0 p-2">
      <NotificationsPanel />
    </PopoverContent>
  </Popover>
</template>
