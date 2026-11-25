<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatLightboxHeader from '@/components/chat/ChatLightboxHeader.vue'
import ChatLightboxPhoneBar from '@/components/chat/ChatLightboxPhoneBar.vue'
import ChatLightboxStage from '@/components/chat/ChatLightboxStage.vue'
import ChatLightboxToolbar from '@/components/chat/ChatLightboxToolbar.vue'
import ChatMarkupComment from '@/components/chat/ChatMarkupComment.vue'
import ChatMarkupSheet from '@/components/chat/ChatMarkupSheet.vue'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useLightboxActions } from '@/composables/useLightboxActions'
import { useProvideMarkup } from '@/composables/useMarkup'
import { useMarkupTarget } from '@/composables/useMarkupTarget'
import { useIsPhone } from '@/composables/useViewport'
import { imageMeta, stepIndex, type LightboxImage } from '@/utils/attachments'
import { startModeOf, type LightboxMode } from '@/utils/lightbox'
import type { Size } from '@/utils/markup'
import { historyStepOf, isSendShortcut } from '@/utils/shortcuts'
import { isTextField } from '@/utils/textField'

// The large preview of an image from the composer or the history (Figma "20", "20b", "M19",
// "M20"): view and page, or draw on it. A sent image can take a comment along to the composer; an
// image still in the composer only takes its marks and their notes, as it is written about next
// to its chip there. `initialMode`: what an opening starts in. The composer's own images open
// ready to draw on; sent ones open to look at.
const { images, initialMode = 'view' } = defineProps<{
  images: LightboxImage[]
  initialMode?: LightboxMode
}>()

const isOpen = defineModel<boolean>('open', { required: true })
const index = defineModel<number>('index', { required: true })

const stage = ref<InstanceType<typeof ChatLightboxStage> | null>(null)
const zoom = ref(1)
const natural = ref<Size | null>(null)

const { t, locale } = useI18n()
const isPhone = useIsPhone()
const markup = useProvideMarkup()
const target = useMarkupTarget()
const mode = ref<LightboxMode>(startModeOf(initialMode, !!target))

const current = computed(() => images[index.value] ?? null)
const hasSeveral = computed(() => images.length > 1)
const isMarking = computed(() => mode.value === 'mark')
// An image still in the composer is written about there, next to its chip: the preview only adds
// marks (and their notes), no comment of its own.
const isAttachment = computed(() => !!current.value?.id)
const meta = computed(() =>
  current.value ? imageMeta(current.value.bytes, locale.value, natural.value) : ''
)
const counter = computed(() =>
  hasSeveral.value
    ? t('chat.image_counter', { current: index.value + 1, total: images.length })
    : null
)

const { isApplying, mayLeave, mayStopMarking, apply, copy, download } = useLightboxActions({
  current,
  target,
  markup,
  onApplied: () => {
    mode.value = 'view'
    isOpen.value = false
  }
})

const KEY_STEPS: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 }

// A comment belongs to the image it was written for, so paging asks about it like closing.
const step = (delta: number) => {
  if (!mayLeave()) return
  markup.reset()
  index.value = stepIndex(index.value, delta, images.length)
}

// Every way out (Esc, ×, the overlay) comes through here, so unsaved markup is asked about once.
const setOpen = (next: boolean) => {
  if (next || mayLeave()) isOpen.value = next
}

// Back to viewing hides the drawing tools and drops the strokes; the comment stays.
const setMode = (next: LightboxMode) => {
  if (next === 'view' && !mayStopMarking()) return
  if (next === 'view') markup.clearStrokes()
  mode.value = next
}

const discard = () => {
  markup.reset()
  mode.value = 'view'
}

// Focus the image, not the first button: a focused icon button opens its tooltip right away.
const focusStage = (event: Event) => {
  event.preventDefault()
  stage.value?.focus()
}

/** Undo and redo of the drawing; false for any other key. */
const handleMarkKey = (event: KeyboardEvent) => {
  const action = historyStepOf(event)
  if (!action) return false
  event.preventDefault()
  markup[action]()
  return true
}

const handleKeydown = (event: KeyboardEvent) => {
  // Also from inside a note or the comment, where a plain Enter has its own meaning.
  if (target && isSendShortcut(event)) {
    event.preventDefault()
    void apply('send')
    return
  }
  // The comment field keeps its own keys: text undo, and arrows that move the caret.
  if (isTextField(event.target)) return
  if (isMarking.value && handleMarkKey(event)) return
  // Arrows page while marking too, since the composer's images open ready to mark; unsaved
  // marks are asked about first, as on closing (`step` goes through `mayLeave`).
  const delta = KEY_STEPS[event.key]
  if (!delta || !hasSeveral.value) return
  event.preventDefault()
  step(delta)
}

// A marked copy marked again numbers on after what is painted into it already, and its notes
// from earlier rounds come along to change.
watch(current, (image) => markup.load(image), { immediate: true })

watch(index, () => {
  natural.value = null
  zoom.value = 1
})

watch(isOpen, (open) => {
  if (open) {
    mode.value = startModeOf(initialMode, !!target)
    return
  }
  discard()
  zoom.value = 1
})
</script>

<template>
  <Dialog :open="isOpen" @update:open="setOpen">
    <DialogContent
      :show-close-button="false"
      class="inset-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col rounded-none text-stage-foreground ring-0 sm:max-w-none"
      :class="isPhone ? 'gap-0 bg-stage p-0 pt-safe px-safe' : 'gap-3.5 bg-stage/75 px-10 py-6'"
      @keydown="handleKeydown"
      @open-auto-focus="focusStage"
    >
      <template v-if="current">
        <ChatLightboxHeader
          :name="current.name"
          :meta
          :counter
          :is-phone
          :is-marking
          @close="setOpen(false)"
          @cancel="discard"
          @download="download"
        />

        <template v-if="isPhone">
          <ChatLightboxStage
            ref="stage"
            :image="current"
            :natural
            :zoom="1"
            :is-marking
            :can-page="hasSeveral"
            is-phone
            @step="step"
            @load="natural = $event"
          />
          <ChatMarkupSheet
            v-if="isMarking"
            :is-applying
            :has-comment="!isAttachment"
            @apply="apply('compose')"
            @send="apply('send')"
          />
          <ChatLightboxPhoneBar
            v-else
            class="pb-safe"
            :index
            :total="images.length"
            :can-mark="!!target"
            :has-comment="!isAttachment"
            :is-applying
            @step="step"
            @copy="copy"
            @mark="setMode('mark')"
            @apply="apply('compose')"
            @send="apply('send')"
          />
        </template>

        <!-- One dialog: the comment sits under the image and its tools, not in a second panel. -->
        <div v-else class="flex min-h-0 flex-1 flex-col items-center gap-3.5">
          <ChatLightboxStage
            ref="stage"
            class="w-full"
            :image="current"
            :natural
            :zoom
            :is-marking
            :can-page="hasSeveral"
            :is-phone="false"
            @step="step"
            @load="natural = $event"
          />
          <ChatLightboxToolbar
            v-model:zoom="zoom"
            class="max-w-full flex-wrap justify-center"
            :mode
            :can-mark="!!target"
            @update:mode="setMode"
            @copy="copy"
            @download="download"
          />
          <ChatMarkupComment
            v-if="target && (isMarking || !isAttachment || !!current.notes?.length)"
            class="w-full max-w-180 shrink-0"
            :is-marking
            :has-comment="!isAttachment"
            :is-applying
            @discard="discard"
            @apply="apply('compose')"
            @send="apply('send')"
          />
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
