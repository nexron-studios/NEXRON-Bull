<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, CheckCheck, ShieldAlert, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchKbd from '@/components/common/NchKbd.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChoiceKeys } from '@/composables/useChoiceKeys'
import { alwaysTargetOf, approvalSummaryOf } from '@/utils/approval'
import type { PermissionAsk } from '@/utils/chatTab'
import { glowClassOf } from '@/theme/glow'

// A tool call waiting for the user (Figma "36"): one header row, the command whole, the
// description, then the buttons in reading order, the primary one first, and a field to turn the
// call down with a reason Claude reads, like the terminal's "No, and tell Claude what to do".
// `isKeyed`: only the chat on screen takes number keys, not one still sliding out.
const { permission, isKeyed } = defineProps<{ permission: PermissionAsk; isKeyed: boolean }>()
const emit = defineEmits<{ answer: [isAllowed: boolean, reason?: string]; always: [] }>()

const reason = ref('')

const { t } = useI18n()

const summary = computed(() => approvalSummaryOf(permission.input))
const details = computed(() => JSON.stringify(permission.input, null, 2))
const hasAlways = computed(() => permission.suggestions.length > 0)
const alwaysLabel = computed(() => {
  const target = alwaysTargetOf(permission.suggestions)
  return target ? t('chat.allow_always_for', { target }) : t('chat.allow_always')
})

const deny = () => emit('answer', false, reason.value.trim())

// Numbered like Claude Code's terminal prompt, so a habit from there never allows by mistake:
// 1 allows, 2 always allows (when offered), the last number denies. The field keeps its digits.
const choices = computed(() => [
  () => emit('answer', true),
  ...(hasAlways.value ? [() => emit('always')] : []),
  deny
])
const keyOf = (index: number) => String(index + 1)
const denyKey = computed(() => keyOf(choices.value.length - 1))

const denyWithReason = () => {
  if (reason.value.trim()) deny()
}

useChoiceKeys(
  () => (isKeyed ? choices.value.length : 0),
  (index) => choices.value[index]?.()
)

// The card stays mounted when Claude asks again right away; a reason belongs to one call.
watch(
  () => permission.requestId,
  () => {
    reason.value = ''
  }
)
</script>

<template>
  <section
    :class="glowClassOf('critical')"
    class="flex flex-col gap-2 rounded-xl px-3 py-2.5"
    role="alertdialog"
    data-choice-card
    :aria-label="t('chat.permission_title', { tool: permission.toolName })"
  >
    <h2 class="flex min-w-0 items-center gap-2 text-small">
      <ShieldAlert class="size-4 shrink-0 text-critical" aria-hidden="true" />
      <span class="font-semibold">{{ t('chat.permission_needed') }}</span>
      <span class="truncate text-meta text-muted-foreground">{{ permission.toolName }}</span>
    </h2>
    <pre
      v-if="summary.line"
      class="max-h-32 overflow-auto rounded-md bg-card px-2.5 py-1.5 font-mono text-meta break-all whitespace-pre-wrap"
      >{{ summary.line }}</pre>
    <!-- Without a command or path line, the input itself is the only way to see the call. -->
    <pre
      v-if="!summary.line"
      class="max-h-56 overflow-auto rounded-md bg-card px-2.5 py-1.5 font-mono text-meta whitespace-pre-wrap text-subtle"
      >{{ details }}</pre>
    <details v-else-if="summary.hasMore" class="text-meta">
      <summary
        class="w-fit cursor-pointer rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {{ t('chat.permission_details') }}
      </summary>
      <pre
        class="mt-1.5 max-h-56 overflow-auto rounded-md bg-card px-2.5 py-1.5 font-mono whitespace-pre-wrap text-subtle"
        >{{ details }}</pre>
    </details>
    <p v-if="summary.description" class="line-clamp-2 text-meta text-muted-foreground">
      {{ summary.description }}
    </p>
    <div class="flex flex-wrap gap-1.5">
      <Button
        size="sm"
        class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
        aria-keyshortcuts="1"
        @click="emit('answer', true)"
      >
        <Check aria-hidden="true" />
        {{ t('chat.allow') }}
        <NchKbd key-label="1" is-on-brand />
      </Button>
      <!-- The rule can be a whole chained command; the line above shows it in full, so the label
           may shrink to the card and cut off. -->
      <Button
        v-if="hasAlways"
        variant="outline"
        size="sm"
        class="max-w-full min-w-0 shrink"
        aria-keyshortcuts="2"
        @click="emit('always')"
      >
        <CheckCheck aria-hidden="true" />
        <span class="truncate">{{ alwaysLabel }}</span>
        <NchKbd key-label="2" />
      </Button>
      <Button variant="outline" size="sm" :aria-keyshortcuts="denyKey" @click="deny">
        <X aria-hidden="true" />
        {{ t('chat.deny') }}
        <NchKbd :key-label="denyKey" />
      </Button>
    </div>
    <form class="relative" @submit.prevent="denyWithReason">
      <Input
        v-model="reason"
        :aria-label="t('chat.deny_reason_label')"
        :placeholder="t('chat.deny_reason_placeholder')"
        autocomplete="off"
        class="bg-card pr-56 text-small"
      />
      <span
        v-if="reason.trim()"
        class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center gap-1.5 text-meta text-muted-foreground"
      >
        <NchKbd key-label="Enter" />
        {{ t('chat.deny_reason_hint') }}
      </span>
    </form>
  </section>
</template>
