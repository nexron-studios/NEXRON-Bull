<script setup lang="ts">
import { BellOff } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

// Next to the title of a muted chat, in its tab and its session row.
const { t } = useI18n()
</script>

<template>
  <BellOff class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
  <span class="sr-only">{{ t('notifications.muted') }}</span>
</template>
