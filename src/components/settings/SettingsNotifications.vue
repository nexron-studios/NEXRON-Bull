<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import NotificationsPanel from '@/components/notifications/NotificationsPanel.vue'
import SettingsSectionHeader from '@/components/settings/SettingsSectionHeader.vue'

// The same panel as the bell's popover, so both always show and change one setting.
const { isPhone = false } = defineProps<{ isPhone?: boolean }>()

const { t } = useI18n()
</script>

<template>
  <SettingsSectionHeader
    :title="t('settings.sections.notifications')"
    :description="t('settings.notifications.description')"
    :is-phone
  />
  <div class="rounded-xl border border-border bg-card p-2 @3xl:px-4 @3xl:py-3">
    <NotificationsPanel :is-phone has-own-title />
  </div>
</template>
