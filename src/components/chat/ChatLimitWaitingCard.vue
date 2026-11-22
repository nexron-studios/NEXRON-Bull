<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeftRight, Pencil, Send, Timer, X } from '@lucide/vue'
import { useMinuteClock } from '@/composables/useClock'
import { useI18n } from 'vue-i18n'
import type { LimitState, QueuedPromptProps } from '@/types/agentd.type'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Button } from '@/components/ui/button'
import { offerKeyOf, resetOf, waitHintKeyOf } from '@/utils/limits'
import { glowClassOf } from '@/theme/glow'

// The chat waits for its account's reset (Figma "25", "M26"): why, the messages that go out then,
// and the way out: another account, or sending now.
const { state } = defineProps<{ state: Extract<LimitState, { kind: 'waiting' }> }>()
const emit = defineEmits<{
  move: [profile: string]
  send: []
  remove: [entry: number]
  edit: [prompt: QueuedPromptProps]
}>()

const { t, locale } = useI18n()
const now = useMinuteClock()

const reset = computed(() => resetOf(state.account.resets_at_ms, now.value.getTime(), locale.value))
const offer = computed(() => state.candidates[0] ?? null)
</script>

<template>
  <section
    :class="glowClassOf('read')"
    class="flex flex-col gap-2 rounded-xl px-3 py-2.5"
    role="status"
  >
    <h2 class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-small">
      <Timer class="size-4 shrink-0 text-act-read" aria-hidden="true" />
      <span class="font-semibold">{{
        t('chat.limit.waiting_title', { account: state.account.label })
      }}</span>
      <span v-if="reset" class="ml-auto text-meta text-muted-foreground tabular-nums">
        {{ t('chat.limit.reset', reset) }}
      </span>
    </h2>
    <p class="text-small text-muted-foreground">
      {{ t(waitHintKeyOf(state.reason), { account: state.account.label }) }}
    </p>
    <ol
      v-if="state.queue.length"
      class="flex flex-col gap-1.5"
      :aria-label="t('chat.limit.queue_label')"
    >
      <li
        v-for="(prompt, index) in state.queue"
        :key="prompt.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card py-1 pr-1 pl-2.5"
      >
        <span
          class="grid size-4.5 shrink-0 place-items-center rounded-full bg-muted text-meta text-muted-foreground"
          aria-hidden="true"
        >
          {{ index + 1 }}
        </span>
        <span class="line-clamp-2 min-w-0 flex-1 text-small break-words">{{ prompt.text }}</span>
        <span v-if="prompt.images" class="shrink-0 text-meta text-muted-foreground">
          {{ t('chat.limit.queue_images', prompt.images) }}
        </span>
        <!-- The images stay in agentd, so only a text-only message can come back to the composer. -->
        <NchIconButton
          v-if="!prompt.images"
          :label="t('chat.limit.edit')"
          size="icon-sm"
          variant="ghost"
          @click="emit('edit', prompt)"
        >
          <Pencil class="size-3.5" aria-hidden="true" />
        </NchIconButton>
        <NchIconButton
          :label="t('chat.limit.remove')"
          size="icon-sm"
          variant="ghost"
          @click="emit('remove', prompt.id)"
        >
          <X class="size-3.5" aria-hidden="true" />
        </NchIconButton>
      </li>
    </ol>
    <div class="flex flex-wrap justify-end gap-1.5">
      <Button variant="outline" size="sm" @click="emit('send')">
        <Send aria-hidden="true" />
        {{ t('chat.limit.send_now') }}
      </Button>
      <Button v-if="offer" variant="outline" size="sm" @click="emit('move', offer.profile)">
        <ArrowLeftRight aria-hidden="true" />
        {{ t(offerKeyOf(state.reason), { account: offer.label }) }}
      </Button>
    </div>
  </section>
</template>
