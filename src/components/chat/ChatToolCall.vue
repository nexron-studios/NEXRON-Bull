<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { Check, ChevronRight, CircleDashed, LoaderCircle, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ChatDiffView from '@/components/chat/ChatDiffView.vue'
import ChatShellOutput from '@/components/chat/ChatShellOutput.vue'
import { countsOf, rowsOfHunks } from '@/utils/diffRows'
import { hunksOfTool } from '@/utils/toolInput'
import { TOOL_ICON, TOOL_KIND_CLASS } from '@/utils/toolIcons'
import { isSkillTool, toolInfoOf } from '@/utils/toolKind'
import { isShellTool } from '@/utils/toolOutput'
import { resultTextOf, type ToolResultBlock } from '@/utils/toolPairs'
import { skillArgsOf, summarizeToolInput } from '@/utils/toolSummary'
import { toDataUrl } from '@/utils/attachments'

// One quiet row per call on a thin rail (Figma "38" A, 19.11.2026): steps in a row no longer
// fill the chat. Closed by default; a click opens diff, shell output or input and result below.
// Replaces the open-by-default cards of Figma "30", after prompt-kit's Tool (MIT).
const {
  name,
  input,
  result = null,
  isRunning = false
} = defineProps<{
  name: string
  input: Record<string, unknown>
  result?: ToolResultBlock | null
  /** The turn is still going, so a call without result is in progress rather than abandoned */
  isRunning?: boolean
}>()

const { t } = useI18n()

type ToolState = 'running' | 'done' | 'error' | 'stopped'
const STATE_LOOK: Record<ToolState, { icon: Component; class: string }> = {
  running: { icon: LoaderCircle, class: 'animate-spin text-warning' },
  done: { icon: Check, class: 'text-good' },
  error: { icon: X, class: 'text-critical' },
  stopped: { icon: CircleDashed, class: 'text-muted-foreground' }
}
const state = computed<ToolState>(() => {
  if (result) return result.is_error ? 'error' : 'done'
  return isRunning ? 'running' : 'stopped'
})
const summary = computed(() => summarizeToolInput(input))
const info = computed(() => toolInfoOf(name, summary.value))
// A skill call names its skill on a tint of its own and shows the args as text, not as JSON.
const isSkill = computed(() => isSkillTool(name))
const skillArgs = computed(() => (isSkill.value ? skillArgsOf(input) : ''))
const rowText = computed(() =>
  isSkill.value ? (skillArgs.value.split('\n')[0] ?? '') : summary.value
)
// Line numbers and context only come with Claude Code's patch; the input alone has neither.
const diffHunks = computed(() => hunksOfTool(name, input, result?.patch))
const diffRows = computed(() => (diffHunks.value ? rowsOfHunks(diffHunks.value) : null))
const counts = computed(() => (diffHunks.value ? countsOf(diffHunks.value) : null))
const isShell = computed(() => isShellTool(name))
const isOpen = ref(false)
const handleToggle = (event: Event) => {
  isOpen.value = (event.target as HTMLDetailsElement).open
}
const details = computed(() => JSON.stringify(input, null, 2))
const output = computed(() => (result ? resultTextOf(result) : ''))
const images = computed(() =>
  (result?.content ?? []).filter(
    (block): block is Extract<typeof block, { type: 'image' }> => block.type === 'image'
  )
)
</script>

<template>
  <details
    class="group relative w-full pl-3 before:absolute before:-top-1 before:-bottom-1 before:left-0 before:w-px before:bg-border"
    :open="isOpen"
    @toggle="handleToggle"
  >
    <summary
      class="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 text-small select-none hover:bg-muted/60 [&::-webkit-details-marker]:hidden"
      :class="{ 'bg-muted/60': state === 'running' }"
    >
      <component
        :is="TOOL_ICON[info.icon]"
        class="size-4 shrink-0"
        :class="TOOL_KIND_CLASS[info.kind]"
        aria-hidden="true"
      />
      <span class="font-medium">{{ name }}</span>
      <span
        v-if="isSkill && summary"
        class="max-w-1/2 shrink-0 truncate rounded-sm bg-act-skill/12 px-1.5 font-medium text-act-skill"
        >{{ summary }}</span
      >
      <span class="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground">{{
        rowText
      }}</span>
      <span v-if="counts" class="flex shrink-0 gap-1.5 font-mono text-meta tabular-nums">
        <span class="sr-only">{{ t('chat.diff_counts', counts) }}</span>
        <span class="text-good" aria-hidden="true">+{{ counts.added }}</span>
        <span class="text-critical" aria-hidden="true">−{{ counts.removed }}</span>
      </span>
      <component
        :is="STATE_LOOK[state].icon"
        class="size-3.5 shrink-0"
        :class="STATE_LOOK[state].class"
        aria-hidden="true"
      />
      <span class="sr-only">{{ t(`chat.tool_state.${state}`) }}</span>
      <ChevronRight
        class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-90"
        aria-hidden="true"
      />
    </summary>
    <template v-if="!isOpen" />
    <div
      v-else-if="diffRows"
      class="mt-1 overflow-hidden rounded-lg border border-border bg-card/60"
    >
      <ChatDiffView :rows="diffRows" />
      <ChatShellOutput v-if="result?.is_error" :text="output" is-error />
    </div>
    <div
      v-else-if="isShell"
      class="mt-1 overflow-hidden rounded-lg border border-border bg-card/60"
    >
      <ChatShellOutput v-if="result" :text="output" :is-error="result.is_error" />
      <pre v-else class="px-3 py-2 font-mono text-meta whitespace-pre-wrap text-subtle">{{
        input.command
      }}</pre>
    </div>
    <div
      v-else
      class="mt-1 flex flex-col gap-1 rounded-lg border border-border bg-card/60 px-3 py-2"
    >
      <template v-if="isSkill">
        <p class="text-meta tracking-wide text-muted-foreground uppercase">
          {{ t('chat.tool_skill_args') }}
        </p>
        <!-- Prose, so the sans font; a pre keeps Claude's line breaks without template whitespace. -->
        <pre
          v-if="skillArgs"
          class="max-h-60 overflow-auto font-sans text-small whitespace-pre-wrap text-subtle"
          >{{ skillArgs }}</pre>
        <p v-else class="text-small text-muted-foreground">{{ t('chat.tool_skill_no_args') }}</p>
      </template>
      <template v-else>
        <p class="text-meta tracking-wide text-muted-foreground uppercase">
          {{ t('chat.tool_input') }}
        </p>
        <pre class="max-h-60 overflow-auto font-mono text-meta whitespace-pre-wrap text-subtle">{{
          details
        }}</pre>
      </template>
      <template v-if="result">
        <p
          class="mt-2 text-meta tracking-wide uppercase"
          :class="result.is_error ? 'text-critical' : 'text-muted-foreground'"
        >
          {{ result.is_error ? t('chat.tool_error') : t('chat.tool_result') }}
        </p>
        <pre class="max-h-72 overflow-auto font-mono text-meta whitespace-pre-wrap text-subtle">{{
          output
        }}</pre>
        <img
          v-for="(image, index) in images"
          :key="index"
          :src="toDataUrl(image.media_type, image.data)"
          alt=""
          class="mt-2 max-h-80 rounded-md"
        />
      </template>
    </div>
  </details>
</template>
