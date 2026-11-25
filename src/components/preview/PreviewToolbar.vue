<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { ExternalLink, RotateCw, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Input } from '@/components/ui/input'
import { typedPreviewUrlOf } from '@/utils/previewUrl'

// The address row above the preview: an editable URL (Enter loads it), reload, the system
// browser and closing the pane. Back and forward are missing on purpose: a page from another
// origin keeps its history to itself.
const {
  url,
  canOpen = false,
  canClose = true
} = defineProps<{
  /** The address the pane shows, `null` while it has none */
  url: string | null
  /** A page is there to reload or hand to the browser */
  canOpen?: boolean
  /** False in the sheet, which has its own close button */
  canClose?: boolean
}>()
const emit = defineEmits<{ load: [url: string]; reload: []; openExternal: []; close: [] }>()

const draft = ref(url ?? '')
const isInvalid = ref(false)
const inputId = useId()
const errorId = useId()

const { t } = useI18n()

const submit = () => {
  const next = typedPreviewUrlOf(draft.value)
  isInvalid.value = !next
  if (next) emit('load', next)
}

// A new address from Claude or a link replaces what stood in the field.
watch(
  () => url,
  (next) => {
    draft.value = next ?? ''
    isInvalid.value = false
  }
)
</script>

<template>
  <form
    class="flex h-10 shrink-0 items-center gap-1 border-b border-border pr-2 pl-3 pointer-coarse:h-14"
    :aria-label="t('preview.toolbar')"
    @submit.prevent="submit"
  >
    <label :for="inputId" class="sr-only">{{ t('preview.url_label') }}</label>
    <Input
      :id="inputId"
      v-model="draft"
      type="text"
      inputmode="url"
      autocomplete="off"
      spellcheck="false"
      :placeholder="t('preview.url_placeholder')"
      :aria-invalid="isInvalid || undefined"
      :aria-describedby="isInvalid ? errorId : undefined"
      class="h-7 flex-1 font-mono md:text-meta pointer-coarse:h-11"
      :class="{ 'motion-shake': isInvalid }"
      @input="isInvalid = false"
    />
    <span v-if="isInvalid" :id="errorId" class="sr-only" role="alert">{{
      t('preview.url_invalid')
    }}</span>
    <NchIconButton
      :label="t('preview.reload')"
      size="icon-sm"
      class="pointer-coarse:size-11"
      :disabled="!canOpen"
      @click="emit('reload')"
    >
      <RotateCw class="size-4" aria-hidden="true" />
    </NchIconButton>
    <NchIconButton
      :label="t('preview.open_external')"
      size="icon-sm"
      class="pointer-coarse:size-11"
      :disabled="!canOpen"
      @click="emit('openExternal')"
    >
      <ExternalLink class="size-4" aria-hidden="true" />
    </NchIconButton>
    <NchIconButton
      v-if="canClose"
      :label="t('preview.close')"
      size="icon-sm"
      class="pointer-coarse:size-11"
      @click="emit('close')"
    >
      <X class="size-4" aria-hidden="true" />
    </NchIconButton>
  </form>
</template>
