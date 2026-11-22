<script setup lang="ts">
import { X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'
import BrandClawdMark from '@/components/brand/BrandClawdMark.vue'
import SettingsBrandPreviewTile from '@/components/settings/SettingsBrandPreviewTile.vue'

// Where the accent shows up outside the page (Figma 22f "Färbt sich mit"): browser tab, taskbar,
// header, Claude mark, in the active scheme.

const { t } = useI18n()
</script>

<template>
  <div class="@container flex flex-col gap-2">
    <span class="text-meta text-muted-foreground">{{
      t('settings.appearance.follows.title')
    }}</span>
    <ul class="grid grid-cols-2 gap-3 @lg:grid-cols-4">
      <SettingsBrandPreviewTile :label="t('settings.appearance.follows.favicon')">
        <span class="flex min-w-0 items-center gap-1.5 rounded-t-md bg-muted px-2 py-1">
          <BrandBullLogo :size="14" />
          <span class="truncate text-meta">{{ t('settings.appearance.follows.tab_title') }}</span>
          <X class="size-3 shrink-0 text-muted-foreground" />
        </span>
      </SettingsBrandPreviewTile>
      <SettingsBrandPreviewTile :label="t('settings.appearance.follows.taskbar')">
        <span class="grid size-11 place-items-center rounded-xl bg-stage shadow-(--shadow-lift)">
          <BrandBullLogo :size="30" />
        </span>
      </SettingsBrandPreviewTile>
      <SettingsBrandPreviewTile :label="t('settings.appearance.follows.header')">
        <span class="flex items-center gap-2">
          <BrandBullLogo :size="20" />
          <span class="font-wordmark text-body uppercase">{{
            t('settings.appearance.follows.wordmark')
          }}</span>
        </span>
      </SettingsBrandPreviewTile>
      <SettingsBrandPreviewTile :label="t('settings.appearance.follows.claude')">
        <span
          class="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-meta"
        >
          <BrandClawdMark :size="10" />
          {{ t('settings.appearance.follows.model') }}
        </span>
      </SettingsBrandPreviewTile>
    </ul>
  </div>
</template>
