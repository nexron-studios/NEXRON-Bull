<script setup lang="ts">
import { computed, ref } from 'vue'
import { Globe } from '@lucide/vue'
import { openLink } from '@/lib/links'
import { useI18n } from 'vue-i18n'
import ChatSourcesDialog from '@/components/chat/ChatSourcesDialog.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { handleError } from '@/lib/error'
import { sourceRowOf, type Source } from '@/utils/sources'

// Pages Claude read this turn as chips, after prompt-kit's Source (MIT). No favicon service:
// the app stays offline-capable and does not tell a third party what Claude read. A long row folds
// into "+N", which opens every page in a dialog.
const { sources } = defineProps<{ sources: Source[] }>()

const isListOpen = ref(false)

const { t } = useI18n()

const row = computed(() => sourceRowOf(sources))

// Links would navigate the app window away; they open in the system browser instead.
const open = (url: string) => openLink(url).catch(handleError)
</script>

<template>
  <ul class="flex max-w-[72ch] flex-wrap gap-2" :aria-label="t('chat.stream.sources')">
    <li v-for="source in row.shown" :key="source.url">
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
    <li v-if="row.hiddenCount">
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            type="button"
            class="motion-press inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-meta font-medium text-foreground tabular-nums hover:bg-accent"
            :aria-label="t('chat.sources.show_all', { n: sources.length })"
            aria-haspopup="dialog"
            @click="isListOpen = true"
          >
            {{ t('chat.sources.more', { n: row.hiddenCount }) }}
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('chat.sources.show_all', { n: sources.length }) }}</TooltipContent>
      </Tooltip>
      <ChatSourcesDialog v-model:open="isListOpen" :sources />
    </li>
  </ul>
</template>
