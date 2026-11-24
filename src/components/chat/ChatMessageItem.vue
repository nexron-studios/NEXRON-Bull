<script setup lang="ts">
import { computed } from 'vue'
import { Archive, Copy, OctagonX, SquareSlash } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { ChatMessage } from '@/types/agentd.type'
import { copyText } from '@/lib/clipboard'
import { imageBlocksOf, toDataUrl } from '@/utils/attachments'
import { sentImageRefHighlightsOf } from '@/utils/imageRefs'
import { textPiecesOf } from '@/utils/textPieces'
import type { ToolResultBlock } from '@/utils/toolPairs'
import type { TurnStats } from '@/utils/turnStats'
import NchIconButton from '@/components/common/NchIconButton.vue'
import ChatAgentMessage from '@/components/chat/ChatAgentMessage.vue'
import ChatHookLine from '@/components/chat/ChatHookLine.vue'
import ChatImageGallery from '@/components/chat/ChatImageGallery.vue'
import ChatLimitMovedCard from '@/components/chat/ChatLimitMovedCard.vue'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import ChatShellBlock from '@/components/chat/ChatShellBlock.vue'
import ChatTextPieces from '@/components/chat/ChatTextPieces.vue'
import ChatToolCall from '@/components/chat/ChatToolCall.vue'
import ChatToolResult from '@/components/chat/ChatToolResult.vue'
import ChatTurnStats from '@/components/chat/ChatTurnStats.vue'
import ChatUserMessageActions from '@/components/chat/ChatUserMessageActions.vue'
import { useCalloutTarget } from '@/composables/useCalloutTarget'
import { toolCardIdOf } from '@/composables/useChatReveal'
import { useImageRefFormat } from '@/composables/useImageRefFormat'

// `stats`: the answer ends its turn; the line under it says what the turn took.
const {
  message,
  results,
  isRunning = false,
  stats = null
} = defineProps<{
  message: ChatMessage
  results: Map<string, ToolResultBlock>
  isRunning?: boolean
  stats?: TurnStats | null
}>()

const { t } = useI18n()
const calloutTarget = useCalloutTarget()
const imageRefFormat = useImageRefFormat()

const isLatestAnswer = computed(() => calloutTarget?.isLatestAnswer(message.uuid) ?? false)

// Copy action on Claude's replies, after prompt-kit's Message actions (MIT).
const replyText = computed(() =>
  message.role === 'assistant'
    ? message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n')
    : ''
)

// All images of a message go into one gallery, placed where the first of them stands.
const imageBlocks = computed(() => imageBlocksOf(message.blocks))
const imageSrcs = computed(() =>
  imageBlocks.value.map((block) => toDataUrl(block.media_type, block.data))
)
const firstImageIndex = computed(() => message.blocks.findIndex((block) => block.type === 'image'))
const texts = computed(() =>
  message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : []))
)

/** A sent prompt's text with its image references highlighted like in the composer. */
const promptPiecesOf = (text: string) =>
  textPiecesOf(text, sentImageRefHighlightsOf(text, imageSrcs.value, imageRefFormat.value))

// What the row under a sent prompt copies; a prompt of only images or a command gets no row.
const promptText = computed(() => (message.role === 'user' ? texts.value.join('\n\n') : ''))

const copyReply = () => copyText(replyText.value)

/** The output that belongs to the `!` command at `index`: the block right after it. */
const shellOutputAt = (index: number) => {
  const next = message.blocks[index + 1]
  return next?.type === 'shell_output' ? next : null
}
</script>

<template>
  <template v-if="message.role === 'system'">
    <template v-for="(block, index) in message.blocks" :key="index">
      <ChatAgentMessage
        v-if="block.type === 'agent_message'"
        :name="block.name"
        :text="block.text"
        :is-report="block.is_report"
      />
      <ChatHookLine
        v-else-if="block.type === 'hook'"
        :event="block.event"
        :tool="block.tool"
        :outcome="block.outcome"
        :text="block.text"
      />
      <div
        v-else-if="block.type === 'compacted'"
        class="flex items-center gap-3 py-2 text-meta text-muted-foreground"
      >
        <span class="h-px flex-1 bg-border" aria-hidden="true" />
        <Archive class="size-4" aria-hidden="true" />
        {{ t('chat.compacted') }}
        <span class="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <ChatLimitMovedCard
        v-else-if="block.type === 'account_moved'"
        :from="block.from"
        :to="block.to"
        :message-id="message.uuid"
      />
    </template>
  </template>

  <div
    v-else
    class="group flex flex-col gap-2"
    :class="message.role === 'user' ? 'items-end' : 'items-start'"
  >
    <template v-for="(block, index) in message.blocks" :key="index">
      <!-- Claude Code writes the interrupt as a user line; it reads as a marker like "compacted". -->
      <div
        v-if="block.type === 'interrupted'"
        class="flex items-center gap-3 self-stretch py-2 text-meta text-muted-foreground"
      >
        <span class="h-px flex-1 bg-border" aria-hidden="true" />
        <OctagonX class="size-4" aria-hidden="true" />
        {{ t('chat.interrupted') }}
        <span class="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <div
        v-else-if="block.type === 'text' && message.role === 'user'"
        class="max-w-[72ch] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-body break-words whitespace-pre-wrap"
      >
        <ChatTextPieces :pieces="promptPiecesOf(block.text)" />
      </div>
      <ChatMarkdown
        v-else-if="block.type === 'text'"
        :text="block.text"
        :has-callout-actions="isLatestAnswer"
      />
      <ChatImageGallery
        v-else-if="block.type === 'image' && index === firstImageIndex"
        :blocks="imageBlocks"
        :texts
      />
      <ChatToolCall
        v-else-if="block.type === 'tool_use'"
        :id="toolCardIdOf(block.id)"
        :name="block.name"
        :input="block.input"
        :result="results.get(block.id) ?? null"
        :is-running
        class="w-full max-w-[72ch]"
      />
      <ChatToolResult
        v-else-if="block.type === 'tool_result'"
        :is-error="block.is_error"
        :content="block.content"
        class="w-full max-w-[72ch] self-start"
      />
      <span
        v-else-if="block.type === 'command'"
        class="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 font-mono text-small"
      >
        <SquareSlash class="size-4 text-act-change" aria-hidden="true" />
        {{ block.name }} {{ block.args }}
      </span>
      <ChatShellBlock
        v-else-if="block.type === 'shell'"
        :command="block.command"
        state="sent"
        :stdout="shellOutputAt(index)?.stdout"
        :stderr="shellOutputAt(index)?.stderr"
        :is-output-here="shellOutputAt(index) !== null"
      />
      <!-- The terminal writes a command's output as a line of its own, right after it. -->
      <pre
        v-else-if="block.type === 'shell_output' && message.blocks[index - 1]?.type !== 'shell'"
        class="w-full max-w-[72ch] self-stretch rounded-xl border border-act-outside/40 bg-card px-3 py-2 font-mono text-meta whitespace-pre-wrap text-muted-foreground">{{ block.stdout }}<span class="text-critical">{{ block.stderr }}</span></pre>
      <pre
        v-else-if="block.type === 'command_output'"
        class="max-w-[72ch] font-mono text-meta whitespace-pre-wrap text-muted-foreground"
        >{{ block.text }}</pre>
    </template>
    <ChatUserMessageActions
      v-if="promptText"
      :uuid="message.uuid"
      :text="promptText"
      :at="message.at"
    />
    <!-- Under the turn's answer copy and stats stay; other replies show copy on hover. -->
    <div v-if="replyText" class="flex items-center gap-2">
      <NchIconButton
        :label="t('chat.copy_reply')"
        size="icon-xs"
        :class="!stats && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'"
        @click="copyReply"
      >
        <Copy aria-hidden="true" />
      </NchIconButton>
      <ChatTurnStats v-if="stats" :stats />
    </div>
  </div>
</template>
