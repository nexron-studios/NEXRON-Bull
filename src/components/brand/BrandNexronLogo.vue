<script setup lang="ts">
import { useI18n } from 'vue-i18n'
// Same cropped file as the Agent Dashboard (from nexron/brand/logo/nexron_logo.svg).
import logoUrl from '@/assets/nexron_logo.svg'

const { height = 22 } = defineProps<{ height?: number }>()
const { t } = useI18n()
</script>

<template>
  <img
    :src="logoUrl"
    :alt="t('global.studio_name')"
    :style="{ height: `${height}px` }"
    class="w-auto select-none"
    draggable="false"
  />
</template>
