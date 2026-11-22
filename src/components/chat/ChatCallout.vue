<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  Check,
  ChevronRight,
  CircleDashed,
  Eye,
  Info,
  Lightbulb,
  MessageCircleQuestion,
  Reply,
  TriangleAlert,
  X
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useCalloutTarget } from '@/composables/useCalloutTarget'
import { glowClassOf, type GlowTone } from '@/theme/glow'
import {
  pointCountOf,
  quotedTextOf,
  quoteOf,
  type CalloutKind,
  type CalloutProps
} from '@/utils/callouts'

// A callout at the end of Claude's answer (Figma "04 Zustände", "Hinweis-Kästen"): each one glows
// in its colour like the cards Claude hands back, so it is clear which text belongs to it. Links
// and their clicks are handled by the surrounding ChatMarkdown. `html` is the rendered body.
const {
  callout,
  html,
  hasActions = false
} = defineProps<{ callout: CalloutProps; html: string; hasActions?: boolean }>()

const LOOKS: Record<CalloutKind, { icon: Component; glow: GlowTone; tone: string }> = {
  info: { icon: Info, glow: 'muted', tone: 'text-muted-foreground' },
  warning: { icon: TriangleAlert, glow: 'critical', tone: 'text-critical' },
  preview: { icon: Eye, glow: 'outside', tone: 'text-act-outside' },
  todo: { icon: CircleDashed, glow: 'subtle', tone: 'text-subtle' },
  tip: { icon: Lightbulb, glow: 'link', tone: 'text-link' },
  question: { icon: MessageCircleQuestion, glow: 'warning', tone: 'text-warning' }
}

const { t } = useI18n()
const target = useCalloutTarget()

const look = computed(() => LOOKS[callout.kind])
const label = computed(() => callout.title ?? t(`chat.callout.${callout.kind}`))
// Folded, the summary says how much is behind it (Figma 37d: "Einzelheiten · 3 Punkte").
const pointCount = computed(() => (callout.isFolded ? pointCountOf(callout.body) : 0))
const actionKind = computed(() =>
  target && hasActions && (callout.kind === 'question' || callout.kind === 'tip')
    ? callout.kind
    : null
)

const reply = () => target?.reply(quotedTextOf(callout))
// The suggestion goes back quoted, so the answer is clear even when the reply holds two of them.
const answerSuggestion = (answer: string) =>
  target?.send(`${quoteOf(quotedTextOf(callout))}\n\n${answer}`)
</script>

<template>
  <!-- A closed <details> still lays out its hidden content as a flex item, so a gap there
       would push the summary off centre. -->
  <component
    :is="callout.isFolded ? 'details' : 'div'"
    :role="callout.isFolded ? undefined : 'note'"
    :aria-label="label"
    class="group flex flex-col rounded-xl px-3 py-2.5"
    :class="[glowClassOf(look.glow), callout.isFolded ? 'open:gap-1.5' : 'gap-1.5']"
  >
    <summary
      v-if="callout.isFolded"
      class="flex cursor-pointer list-none items-center gap-2 rounded-sm text-meta font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      :class="look.tone"
    >
      <ChevronRight
        class="size-4 shrink-0 transition-transform duration-150 ease-out group-open:rotate-90"
        aria-hidden="true"
      />
      <component
        :is="look.icon"
        v-if="callout.kind !== 'info'"
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      {{ label }}
      <span v-if="pointCount" class="font-normal text-muted-foreground">
        {{ t('chat.callout.points', { n: pointCount }, pointCount) }}
      </span>
    </summary>
    <span v-else class="flex items-center gap-2 text-meta font-semibold" :class="look.tone">
      <component :is="look.icon" class="size-4 shrink-0" aria-hidden="true" />
      {{ label }}
    </span>
    <!-- eslint-disable-next-line vue/no-v-html -- markdown-it runs with html: false -->
    <div v-if="callout.body" class="space-y-2 text-foreground" v-html="html" />
    <div v-if="actionKind === 'question'" class="flex gap-2 pt-1">
      <Button variant="outline" size="sm" @click="reply">
        <Reply class="size-4" aria-hidden="true" />
        {{ t('chat.callout.reply') }}
      </Button>
    </div>
    <div v-else-if="actionKind === 'tip'" class="flex gap-2 pt-1">
      <Button variant="outline" size="sm" @click="answerSuggestion(t('chat.callout.yes_message'))">
        <Check class="size-4" aria-hidden="true" />
        {{ t('chat.callout.yes') }}
      </Button>
      <Button variant="outline" size="sm" @click="answerSuggestion(t('chat.callout.no_message'))">
        <X class="size-4" aria-hidden="true" />
        {{ t('chat.callout.no') }}
      </Button>
    </div>
  </component>
</template>
