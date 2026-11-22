<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NAV_ICON, navPageList } from '@/utils/navigation'

// The sidebar's pages (Figma "12 Übersicht"): Sessions, Übersicht, Nutzung as one segmented row.
// Links, not tabs: each is a route, and the current one carries `aria-current="page"`.
const { t } = useI18n()
</script>

<template>
  <nav :aria-label="t('nav.label')" class="flex shrink-0 gap-1">
    <RouterLink
      v-for="page in navPageList"
      :key="page"
      :to="{ name: page }"
      class="flex h-8 min-w-0 flex-auto items-center justify-center gap-1.5 rounded-lg px-1.5 text-small text-muted-foreground transition-colors duration-150 outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
    >
      <!-- A narrow panel keeps the words, they say more than three small icons. -->
      <component
        :is="NAV_ICON[page]"
        class="size-4 shrink-0 @max-sidebar:hidden"
        aria-hidden="true"
      />
      <span class="truncate">{{ t(`nav.${page}`) }}</span>
    </RouterLink>
  </nav>
</template>
