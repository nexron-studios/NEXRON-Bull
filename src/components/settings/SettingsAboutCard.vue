<script setup lang="ts">
import { ArrowUpRight } from '@lucide/vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useI18n } from 'vue-i18n'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'
import BrandNexronLogo from '@/components/brand/BrandNexronLogo.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { handleError } from '@/lib/error'
import { CREATOR_LINK, creatorLinkList } from '@/utils/settings'

// What Bull is and who makes it, as the foot of the settings navigation: the same family as the
// header lockup (bull, wordmark, NEXRON logo), with the version and where code and site live.
const { t } = useI18n()

// Set by Vite from package.json at build time.
const version = __APP_VERSION__

// Links would navigate the app window away; they open in the system browser instead.
const open = (url: string) => openUrl(url).catch(handleError)
</script>

<template>
  <section
    :aria-label="t('settings.creator.label')"
    class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
  >
    <div class="flex items-center gap-2.5">
      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
        <BrandBullLogo :size="22" />
      </span>
      <div class="flex min-w-0 flex-col gap-1">
        <span class="font-wordmark text-body leading-none uppercase select-none">{{
          t('global.app_name')
        }}</span>
        <span class="truncate font-mono text-meta text-muted-foreground tabular-nums">{{
          t('settings.creator.version', { version })
        }}</span>
      </div>
    </div>
    <p class="flex items-center gap-2 border-t border-border pt-3 text-meta text-muted-foreground">
      {{ t('settings.creator.by') }}
      <BrandNexronLogo :height="16" />
    </p>
    <ul class="-mx-1 -mb-1 flex flex-col">
      <li v-for="link in creatorLinkList" :key="link">
        <Tooltip>
          <TooltipTrigger as-child>
            <a
              :href="CREATOR_LINK[link].url"
              class="motion-press flex min-h-8 touch-manipulation items-center gap-2 rounded-md px-2 text-small text-muted-foreground transition-[color,background-color,border-color,transform] duration-150 ease-out outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
              @click.prevent="open(CREATOR_LINK[link].url)"
            >
              <component :is="CREATOR_LINK[link].icon" class="size-4 shrink-0" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ t(`settings.creator.${link}`) }}</span>
              <ArrowUpRight class="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
            </a>
          </TooltipTrigger>
          <TooltipContent>{{ CREATOR_LINK[link].url }}</TooltipContent>
        </Tooltip>
      </li>
    </ul>
  </section>
</template>
