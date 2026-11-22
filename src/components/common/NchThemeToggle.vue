<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sun } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { useThemeToggle } from '@/composables/useThemeToggle'

const { t } = useI18n()
const { isDark, toggleTheme } = useThemeToggle()

// The icon and label name the theme a click switches to.
const label = computed(() => (isDark.value ? t('theme.to_light') : t('theme.to_dark')))
</script>

<template>
  <NchIconButton :label size="icon-sm" @click="toggleTheme">
    <Sun v-if="isDark" class="size-4" aria-hidden="true" />
    <Moon v-else class="size-4" aria-hidden="true" />
  </NchIconButton>
</template>
