<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NAV_ICON, navPageList } from '@/utils/navigation'

// The pages in the collapsed sidebar: icon links, the name in the tooltip and the aria-label.
const { t } = useI18n()
</script>

<template>
  <nav :aria-label="t('nav.label')" class="flex shrink-0 flex-col items-center gap-1">
    <Tooltip v-for="page in navPageList" :key="page">
      <TooltipTrigger as-child>
        <RouterLink
          :to="{ name: page }"
          :aria-label="t(`nav.${page}`)"
          class="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
        >
          <component :is="NAV_ICON[page]" class="size-4" aria-hidden="true" />
        </RouterLink>
      </TooltipTrigger>
      <TooltipContent side="right">{{ t(`nav.${page}`) }}</TooltipContent>
    </Tooltip>
  </nav>
</template>
