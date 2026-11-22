<script setup lang="ts">
import { ClipboardPaste, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PastedText } from '@/utils/pastedText'

// Figma 30: a large paste as a chip next to the images; it goes out as text with the message.
const { paste } = defineProps<{ paste: PastedText }>()
const emit = defineEmits<{ remove: [] }>()

/** Enough of the paste to recognise it in the tooltip. */
const PREVIEW_CHARS = 280

const { t } = useI18n()
</script>

<template>
  <div
    class="flex h-9 items-center gap-1 rounded-lg border border-border bg-secondary py-0.5 pr-0.5 pl-0.5"
  >
    <Tooltip>
      <TooltipTrigger as-child>
        <span
          tabindex="0"
          class="flex items-center gap-2 rounded-md pr-1 text-small text-secondary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span class="grid size-7.5 place-items-center rounded-md bg-muted">
            <ClipboardPaste class="size-4" aria-hidden="true" />
          </span>
          {{ t('prompt_input.paste_chip', { n: paste.lineCount }) }}
        </span>
      </TooltipTrigger>
      <TooltipContent class="max-w-96 font-mono text-meta whitespace-pre-wrap">
        {{ paste.text.slice(0, PREVIEW_CHARS) }}
      </TooltipContent>
    </Tooltip>
    <NchIconButton
      :label="t('prompt_input.paste_remove')"
      size="icon-xs"
      class="shrink-0 text-muted-foreground"
      @click="emit('remove')"
    >
      <X aria-hidden="true" />
    </NchIconButton>
  </div>
</template>
