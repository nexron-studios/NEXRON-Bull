<script setup lang="ts">
import { Check, ClipboardList, Pencil } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchKbd from '@/components/common/NchKbd.vue'
import { Button } from '@/components/ui/button'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import { useChoiceKeys } from '@/composables/useChoiceKeys'
import { glowClassOf } from '@/theme/glow'

// Claude's plan before it leaves plan mode (Figma "11", "M07"). Leaving plan mode is a permission:
// accepting allows it, adjusting denies it and hands the word back to the composer.
// `isKeyed`: only the chat on screen takes number keys, not one still sliding out.
const { isKeyed } = defineProps<{ plan: string; isKeyed: boolean }>()
const emit = defineEmits<{ accept: []; adjust: [] }>()

const { t } = useI18n()

// 1 accepts, 2 adjusts: the order of Claude Code's own plan prompt.
const CHOICES = [() => emit('accept'), () => emit('adjust')]

useChoiceKeys(
  () => (isKeyed ? CHOICES.length : 0),
  (index) => CHOICES[index]?.()
)
</script>

<template>
  <section
    :class="glowClassOf('change')"
    class="flex flex-col gap-2 rounded-xl px-3 py-2.5"
    role="alertdialog"
    data-choice-card
    :aria-label="t('chat.plan_title')"
  >
    <h2 class="flex items-center gap-2 text-small">
      <ClipboardList class="size-4 shrink-0 text-act-change" aria-hidden="true" />
      <span class="font-semibold">{{ t('chat.plan') }}</span>
      <span class="text-meta text-muted-foreground">{{ t('chat.modes.plan') }}</span>
    </h2>
    <!-- Focusable, so a long plan can be scrolled from the keyboard before accepting it. -->
    <div
      class="max-h-80 overflow-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabindex="0"
      role="region"
      :aria-label="t('chat.plan')"
    >
      <ChatMarkdown :text="plan" size="small" />
    </div>
    <div class="flex flex-wrap justify-end gap-1.5">
      <Button variant="outline" size="sm" aria-keyshortcuts="2" @click="emit('adjust')">
        <Pencil aria-hidden="true" />
        {{ t('chat.plan_adjust') }}
        <NchKbd key-label="2" />
      </Button>
      <Button
        size="sm"
        class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
        aria-keyshortcuts="1"
        @click="emit('accept')"
      >
        <Check aria-hidden="true" />
        {{ t('chat.plan_accept') }}
        <NchKbd key-label="1" is-on-brand />
      </Button>
    </div>
  </section>
</template>
