<script setup lang="ts">
import { computed, ref, toRef, useId, useTemplateRef } from 'vue'
import { ArrowUp, CornerDownLeft, DollarSign, LoaderCircle, Paperclip, Square } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchKbd from '@/components/common/NchKbd.vue'
import ChatComposerAttachments from '@/components/chat/ChatComposerAttachments.vue'
import ChatComposerChips from '@/components/chat/ChatComposerChips.vue'
import ChatComposerField from '@/components/chat/ChatComposerField.vue'
import ChatComposerMenu from '@/components/chat/ChatComposerMenu.vue'
import ChatComposerQueue from '@/components/chat/ChatComposerQueue.vue'
import ChatContextRing from '@/components/chat/ChatContextRing.vue'
import ChatPasteChip from '@/components/chat/ChatPasteChip.vue'
import { useComposerMenu } from '@/composables/useComposerMenu'
import { useComposerPaste } from '@/composables/useComposerPaste'
import { useImageAttachments } from '@/composables/useImageAttachments'
import { useImageReferences } from '@/composables/useImageReferences'
import type { MarkupResult } from '@/composables/useMarkupTarget'
import { usePromptHistory } from '@/composables/usePromptHistory'
import { useDraftStore } from '@/stores/drafts'
import { useHeldPromptsStore } from '@/stores/heldPrompts'
import { useShellRunsStore } from '@/stores/shellRuns'
import { useSlashCommandsStore } from '@/stores/slashCommands'
import { prependLine, truncateName } from '@/utils/attachments'
import { quoteOf } from '@/utils/callouts'
import type { ChatTabState } from '@/utils/chatTab'
import { imageTypeList, type PendingImage } from '@/utils/content'
import { withPastes } from '@/utils/pastedText'
import { draftWithUnsent } from '@/utils/pendingPrompts'
import { folderNameOf } from '@/utils/sessionList'
import { parseSlashInput } from '@/utils/slashCommands'

// Prompt input after prompt-kit (Figma "Prompt Input", Fassung 8: 30 to 32b): held messages and
// the `/` or `@` menu above, images, pastes and text in the box, chips, context ring and send
// below. `!` at the start switches to a shell command for the chat's folder.
const {
  tab,
  isWorking,
  isCompact = false
} = defineProps<{ tab: ChatTabState; isWorking: boolean; isCompact?: boolean }>()
const emit = defineEmits<{ send: [text: string, images: PendingImage[]]; interrupt: [] }>()

const picker = ref<HTMLInputElement | null>(null)
const field = useTemplateRef<InstanceType<typeof ChatComposerField>>('field')
const menuView = useTemplateRef<InstanceType<typeof ChatComposerMenu>>('menuView')
const caret = ref(0)
const isShell = ref(false)

const menuId = useId()
const { t } = useI18n()
// Text, images and reads still running survive the composer: back to the phone's list or another
// tab and back again.
const stored = useDraftStore().draftOf(tab.id)
const draft = toRef(stored, 'text')
const pastes = toRef(stored, 'pastes')
const references = useImageReferences(draft, toRef(stored, 'images'))
const {
  images,
  readingCount,
  isReading,
  addFiles,
  remove,
  move,
  reorder,
  clear,
  placeMarkedImages
} = useImageAttachments(toRef(stored, 'images'), toRef(stored, 'readingCount'), references.follow)
const held = useHeldPromptsStore()
const shell = useShellRunsStore()
const slashCommands = useSlashCommandsStore()
const focusField = () => field.value?.focus()
const setCaret = (at: number) => void field.value?.setCaret(at)
const menu = useComposerMenu({
  tab: () => tab,
  draft,
  caret,
  isEnabled: computed(() => !isShell.value),
  onRun: (text) => submitText(text),
  onInsert: (replaced) => {
    draft.value = replaced.text
    setCaret(replaced.caret)
  }
})
const history = usePromptHistory(() => [...tab.messages, ...tab.pending], draft, setCaret)

/**
 * Pasted, dropped or picked images: each also gets a reference where the user writes, or at the
 * end when the field never had the caret. A shell command has no room for one.
 */
const attachFiles = async (files: Iterable<File>) => {
  const added = await addFiles(files)
  if (isShell.value) return
  const isFocused = field.value?.isFocused() ?? false
  const caretAfter = references.insert(added, field.value?.selection() ?? null)
  if (caretAfter !== null && isFocused) setCaret(caretAfter)
}

const { handlePaste } = useComposerPaste({ images, pastes, isShell, addFiles: attachFiles })

// Images still being read would otherwise miss this message and turn up in the next one.
const canSend = computed(
  () =>
    !isReading.value && (!!draft.value.trim() || images.value.length > 0 || pastes.value.length > 0)
)
const heldPrompts = computed(() => held.heldOf(tab.id))
const isShellReady = computed(() => isShell.value && !!draft.value.trim())
// A chat waiting for its limit to reset says where a message goes meanwhile.
const placeholder = computed(() => {
  if (isShell.value) return t('prompt_input.shell_placeholder')
  if (tab.limit.kind === 'waiting') return t('chat.limit.composer_placeholder')
  return t('chat.composer_placeholder')
})

const clearDraft = () => {
  draft.value = ''
  pastes.value = []
  clear()
}

/** A slash command the app handles runs here; everything else goes to Claude. */
const submitText = (text: string) => {
  // Images still being read would otherwise miss this message and turn up in the next one.
  if (isReading.value) return
  const slash = parseSlashInput(text)
  const isBare = !images.value.length && !pastes.value.length
  if (slash && isBare && slashCommands.run(tab.id, slash.name, slash.args)) return clearDraft()
  emit('send', withPastes(text, pastes.value), images.value)
  clearDraft()
}

const runShell = () => {
  const command = draft.value.trim()
  if (!command) return
  void shell.start(tab, command)
  draft.value = ''
  isShell.value = false
}

const submit = () => {
  if (isShell.value) return runShell()
  if (canSend.value) submitText(draft.value.trim())
}

// `!` typed into the empty field is the switch, not part of the command; Esc or Backspace in the
// empty field leaves the shell, like the terminal's bash mode.
const handleShellKey = (event: KeyboardEvent): boolean => {
  if (!isShell.value && event.key === '!' && !draft.value) {
    event.preventDefault()
    isShell.value = true
    return true
  }
  if (!isShell.value) return false
  if (event.key !== 'Escape' && !(event.key === 'Backspace' && !draft.value)) return false
  event.preventDefault()
  isShell.value = false
  return true
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.isComposing || menu.handleKey(event) || handleShellKey(event)) return
  const textarea = field.value?.field
  if (textarea) references.selectWhole(event, textarea)
  if (textarea && history.handleKey(event, textarea)) return
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  submit()
}

/** A held message goes back into the field to change it; sent again, it queues anew. */
const editHeld = (id: string) => {
  const prompt = held.release(tab.id, id)
  if (!prompt) return
  Object.assign(stored, draftWithUnsent(stored, [prompt], references.format.value))
  setCaret(draft.value.length)
}

const handlePicked = (event: Event) => {
  const input = event.target as HTMLInputElement
  void attachFiles(input.files ?? [])
  input.value = ''
}

/** A prompt suggestion lands in the field, ready to edit or send. */
const fill = (text: string) => {
  draft.value = text
  focusField()
}

/** "Antworten" on a callout: the question quoted on top, the caret below it, nothing sent. */
const quote = (question: string) => {
  // In the shell the quote line would run as a command (`>` redirects into a file).
  isShell.value = false
  const quoted = `${quoteOf(question)}\n\n`
  draft.value = `${quoted}${draft.value}`
  setCaret(quoted.length)
}

/** The name only helps the user; Claude sees no file names, so the line counts the image. */
const COMMENT_NAME_MAX = 24

/** A marked image from the preview, its comment in front of the draft; nothing is sent. */
const takeMarkup = ({ sourceId, images: incoming, name, comment }: MarkupResult) => {
  if (incoming.length && !placeMarkedImages(sourceId, incoming)) return false
  const anchorId = incoming[0]?.id ?? sourceId
  const n = images.value.findIndex((image) => image.id === anchorId) + 1
  if (comment) {
    const line = t('images.comment_line', {
      n,
      name: truncateName(name, COMMENT_NAME_MAX),
      comment
    })
    draft.value = prependLine(draft.value, line)
  }
  focusField()
  return true
}

defineExpose({ addFiles: attachFiles, fill, focus: focusField, quote, takeMarkup })
</script>

<template>
  <div class="flex flex-col gap-2">
    <ChatComposerQueue
      v-if="heldPrompts.length"
      :prompts="heldPrompts"
      @edit="editHeld"
      @remove="held.release(tab.id, $event)"
    />
    <div class="relative">
      <ChatComposerMenu
        v-if="menu.isOpen.value && menu.trigger.value"
        :id="menuId"
        ref="menuView"
        :kind="menu.trigger.value.kind"
        :sections="menu.sections.value"
        :active-key="menu.activeRow.value?.key ?? null"
        :notice="menu.notice.value"
        :is-truncated="menu.isTruncated.value"
        class="absolute inset-x-0 bottom-full z-20 mb-2"
        @pick="menu.pick"
      />
      <form
        class="flex flex-col rounded-2xl border bg-card transition-colors focus-within:ring-3"
        :class="
          isShell
            ? 'border-act-outside focus-within:ring-act-outside/30'
            : 'border-input focus-within:border-ring focus-within:ring-ring/50'
        "
        @submit.prevent="submit"
      >
        <div
          v-if="images.length || isReading || pastes.length"
          class="flex flex-col gap-2 px-3 pt-2"
        >
          <ChatComposerAttachments
            v-if="images.length || isReading"
            :images
            :reading-count="readingCount"
            @update:images="reorder"
            @remove="remove"
            @move="move"
          />
          <ul v-if="pastes.length" class="flex flex-wrap gap-2 pt-1.5">
            <li v-for="paste in pastes" :key="paste.id">
              <ChatPasteChip :paste @remove="pastes = pastes.filter((p) => p.id !== paste.id)" />
            </li>
          </ul>
        </div>
        <div class="relative flex items-start">
          <span
            v-if="isShell"
            class="mt-3 ml-3 flex shrink-0 items-center gap-1 rounded-md bg-act-outside/15 px-1.5 py-0.5 text-meta font-semibold text-act-outside"
          >
            <DollarSign class="size-3" aria-hidden="true" />
            {{ t('prompt_input.shell_badge') }}
          </span>
          <ChatComposerField
            ref="field"
            v-model="draft"
            class="min-w-0 flex-1"
            :label="isShell ? t('prompt_input.shell_label') : t('chat.composer_label')"
            :placeholder="placeholder"
            :known="menu.known.value"
            :highlights="references.highlights.value"
            :is-shell
            :menu-id="menu.isOpen.value ? menuId : null"
            :active-option-id="menuView?.activeOptionId ?? null"
            @keydown="handleKeydown"
            @paste="handlePaste"
            @caret="caret = $event"
          />
          <span
            v-if="!draft && !isShell && !isCompact"
            class="pointer-events-none absolute top-3.5 right-4 text-meta text-muted-foreground"
            aria-hidden="true"
          >
            {{ t('prompt_input.placeholder_keys') }}
          </span>
        </div>
        <div class="flex items-center gap-1 px-2 pb-2">
          <input
            ref="picker"
            type="file"
            :accept="imageTypeList.join(',')"
            multiple
            class="hidden"
            @change="handlePicked"
          />
          <template v-if="isShell">
            <i18n-t
              keypath="prompt_input.shell_hint"
              tag="p"
              scope="global"
              class="min-w-0 flex-1 truncate px-2 text-meta text-muted-foreground"
            >
              <template #folder>
                <span class="font-mono">{{ folderNameOf(tab.cwd) }}</span>
              </template>
              <template #key><NchKbd key-label="Esc" /></template>
            </i18n-t>
            <NchIconButton
              type="submit"
              variant="default"
              size="icon"
              class="shrink-0 rounded-full"
              :label="t('prompt_input.run_shell')"
              :disabled="!isShellReady"
            >
              <CornerDownLeft class="size-4" aria-hidden="true" />
            </NchIconButton>
          </template>
          <template v-else>
            <NchIconButton
              :label="t('chat.add_image')"
              size="icon-sm"
              class="shrink-0"
              @click="picker?.click()"
            >
              <Paperclip class="size-4" aria-hidden="true" />
            </NchIconButton>
            <ChatComposerChips :tab :is-compact class="flex-1" />
            <ChatContextRing v-if="!isCompact" :tab-id="tab.id" />
            <NchIconButton
              v-if="isWorking"
              variant="outline"
              size="icon"
              class="shrink-0 rounded-full"
              :label="t('chat.stop')"
              @click="emit('interrupt')"
            >
              <Square class="size-3.5 fill-current" aria-hidden="true" />
            </NchIconButton>
            <NchIconButton
              v-else
              type="submit"
              variant="default"
              size="icon"
              class="shrink-0 rounded-full"
              :label="t('chat.send')"
              :disabled="!canSend"
              :aria-busy="isReading"
            >
              <LoaderCircle v-if="isReading" class="size-4 animate-spin" aria-hidden="true" />
              <ArrowUp v-else class="size-4" aria-hidden="true" />
            </NchIconButton>
          </template>
        </div>
      </form>
    </div>
  </div>
</template>
