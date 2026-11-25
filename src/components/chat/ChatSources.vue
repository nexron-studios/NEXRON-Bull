<script setup lang="ts">
import { Globe } from '@lucide/vue'
import { openLink } from '@/lib/links'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { handleError } from '@/lib/error'
import type { Source } from '@/utils/sources'

// Pages Claude read this turn as chips, after prompt-kit's Source (MIT). No favicon service:
// the app stays offline-capable and does not tell a third party what Claude read.
defineProps<{ sources: Source[] }>()

const { t } = useI18n()

// Links would navigate the app window away; they open in the system browser instead.
const open = (url: string) => openLink(url).catch(handleError)
</script>

<template>
  <ul class="flex max-w-[72ch] flex-wrap gap-2" :aria-label="t('chat.stream.sources')">
    <li v-for="source in sources" :key="source.url">
      <Tooltip>
        <TooltipTrigger as-child>
          <a
            :href="source.url"
            class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-meta text-subtle hover:bg-accent hover:text-foreground"
            @click.prevent="open(source.url)"
          >
            <Globe class="size-3.5 shrink-0 text-act-read" aria-hidden="true" />
            {{ source.domain }}
          </a>
        </TooltipTrigger>
        <TooltipContent class="max-w-sm break-all">{{ source.url }}</TooltipContent>
      </Tooltip>
    </li>
  </ul>
</template>
