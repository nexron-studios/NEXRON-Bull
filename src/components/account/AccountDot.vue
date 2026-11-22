<script setup lang="ts">
import { computed } from 'vue'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import { ACCOUNT_TONE_CLASS } from '@/utils/quota'

// The colour that marks one Claude account wherever it shows; the name next to it carries it.
// `accountKey` comes from `accountKeyOf`; a colour picked in the settings wins over the hashed one.
const { accountKey } = defineProps<{ accountKey: string }>()

const accountSettings = useAccountSettingsStore()

const toneClass = computed(() => ACCOUNT_TONE_CLASS[accountSettings.toneOfKey(accountKey)])
</script>

<template>
  <span class="size-2 shrink-0 rounded-full" :class="toneClass" aria-hidden="true" />
</template>
