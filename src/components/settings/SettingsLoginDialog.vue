<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Machine } from '@/api/services/agentd.service'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import SettingsLoginPanel from '@/components/settings/SettingsLoginPanel.vue'
import type { ProfileProps } from '@/types/agentd.type'

// "Neu anmelden" of a logged-out or expired account: the same login as for a new one.
defineProps<{ machine: Machine; profile: ProfileProps }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
</script>

<template>
  <NchResponsiveDialog
    v-model:open="open"
    :title="t('settings.login.title', { account: profile.label })"
    :description="t('settings.login.description')"
    content-class="sm:max-w-lg"
  >
    <SettingsLoginPanel :machine :profile @done="open = false" />
  </NchResponsiveDialog>
</template>
