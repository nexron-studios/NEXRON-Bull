<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { History, LoaderCircle, RotateCcw, TriangleAlert } from '@lucide/vue'
import { toast } from '@/lib/toast'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchKbd from '@/components/common/NchKbd.vue'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ChatRewindPoint from '@/components/chat/ChatRewindPoint.vue'
import ChatRewindScopes from '@/components/chat/ChatRewindScopes.vue'
import { useMinuteClock } from '@/composables/useClock'
import { useRewindPoints } from '@/composables/useRewindPoints'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { handleError } from '@/lib/error'
import { RewindRefusedError, useRewindStore } from '@/stores/rewind'
import type { RewindPointProps } from '@/types/agentd.type'
import { fileNameOf, scopesFor, type RewindScope } from '@/utils/rewind'

// Back to before an earlier prompt, like `/rewind` in the terminal (Figma "34", M30).
const { tabId } = defineProps<{ tabId: string }>()

const emit = defineEmits<{ rewound: [] }>()

const SKELETON_ROWS = 3
/** File names named in the hint before the rest is counted */
const NAMED_FILES = 2

const chosen = ref<string | null>(null)
const scope = ref<RewindScope>('both')
const isRewinding = ref(false)
// After a rewind the composer takes focus (the prompt is back there), not the dialog's trigger.
const hasRewound = ref(false)
const pointsList = ref<HTMLFieldSetElement | null>(null)

const { t } = useI18n()
const format = useUsageFormat()
const store = useRewindStore()
const now = useMinuteClock()
const pointsName = useId()

const isOpen = computed({
  get: () => store.openTabId === tabId,
  set: (isNowOpen) => (isNowOpen ? store.openRewind(tabId) : store.closeRewind())
})
const { points, preview } = useRewindPoints(() => tabId, isOpen, chosen)
const list = computed(() => points.data.value ?? [])
const chosenPoint = computed(() => list.value.find((point) => point.uuid === chosen.value) ?? null)
const allowed = computed(() => scopesFor(chosenPoint.value?.has_checkpoint ?? false))
const filesHint = computed(() => {
  const files = preview.data.value
  if (!files) return t('rewind.scope_hints.both_unknown')
  if (!files.length) return t('rewind.scope_hints.both_none')
  const names = files.map(fileNameOf)
  const named =
    names.length > NAMED_FILES + 1
      ? [
          ...names.slice(0, NAMED_FILES),
          t('rewind.files_more', { count: names.length - NAMED_FILES })
        ]
      : names
  return t('rewind.scope_hints.both', { files: format.value.list(named) })
})

const submit = async () => {
  if (!chosenPoint.value || isRewinding.value) return
  isRewinding.value = true
  try {
    await store.rewind(tabId, chosenPoint.value.uuid, scope.value)
    hasRewound.value = true
    isOpen.value = false
    emit('rewound')
  } catch (error) {
    if (!(error instanceof RewindRefusedError)) return handleError(error)
    const key = error.isCodeBack ? 'rewind.refused_code_back' : 'rewind.refused'
    toast.error(t(key, { reason: error.message }))
  } finally {
    isRewinding.value = false
  }
}

// Enter on a choice confirms, as in the terminal; on a button it presses that button.
const handleEnter = (event: KeyboardEvent) => {
  if (!(event.target instanceof HTMLInputElement)) return
  event.preventDefault()
  void submit()
}

// The prompt "Bearbeiten" was pressed under, else the newest: the usual target.
const startOf = (next: RewindPointProps[]) =>
  next.find((point) => point.uuid === store.preferredUuid)?.uuid ?? next[0]?.uuid ?? null

// A choice that vanished (new turn) falls back to the start.
watch(list, (next) => {
  if (!next.some((point) => point.uuid === chosen.value)) chosen.value = startOf(next)
})
watch(allowed, (next) => {
  if (!next.includes(scope.value)) scope.value = next[0] ?? 'conversation'
})
// The dialog opens before the prompts arrive, so its own focus lands on a button; Enter belongs
// to the choice.
watch([chosen, isOpen], async ([uuid, isNowOpen]) => {
  if (!uuid || !isNowOpen) return
  await nextTick()
  pointsList.value?.querySelector<HTMLInputElement>('input:checked')?.focus()
})
// On every opening the start again; the list may be the very same array as last time.
watch(isOpen, (isNowOpen) => {
  if (!isNowOpen) return
  hasRewound.value = false
  chosen.value = startOf(list.value)
  scope.value = 'both'
})
</script>

<template>
  <NchResponsiveDialog
    v-model:open="isOpen"
    :title="t('rewind.title')"
    :description="t('rewind.description')"
    content-class="sm:max-w-xl"
    :restores-focus="!hasRewound"
  >
    <form class="flex flex-col gap-3" @submit.prevent="submit" @keydown.enter="handleEnter">
      <div v-if="points.isPending.value" class="flex flex-col gap-1.5" aria-busy="true">
        <Skeleton v-for="row in SKELETON_ROWS" :key="row" class="h-13 w-full rounded-lg" />
      </div>
      <div v-else-if="points.isError.value" class="flex flex-col items-start gap-2 text-small">
        <span class="text-muted-foreground">{{ t('rewind.failed') }}</span>
        <Button variant="outline" size="sm" @click="points.refetch()">
          <RotateCcw class="size-4" aria-hidden="true" />
          {{ t('rewind.retry') }}
        </Button>
      </div>
      <NchEmpty
        v-else-if="!list.length"
        :icon="History"
        :title="t('rewind.empty_title')"
        :hint="t('rewind.empty_hint')"
        size="sm"
      />
      <template v-else>
        <fieldset
          ref="pointsList"
          class="-mx-1 flex max-h-64 min-w-0 flex-col gap-1.5 overflow-y-auto px-1 py-0.5"
        >
          <legend class="sr-only">{{ t('rewind.points_label') }}</legend>
          <ChatRewindPoint
            v-for="point in list"
            :key="point.uuid"
            v-model="chosen"
            :point
            :now="now.getTime()"
            :name="pointsName"
          />
        </fieldset>
        <ChatRewindScopes v-model="scope" :allowed :files-hint="filesHint" />
        <p
          class="flex items-center gap-2 rounded-lg border border-warning/35 bg-warning/8 px-2.5 py-1.5 text-meta"
        >
          <TriangleAlert class="size-3.5 shrink-0 text-warning" aria-hidden="true" />
          {{ t('rewind.commands_warning') }}
        </p>
      </template>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" @click="isOpen = false">
          {{ t('rewind.cancel') }}
          <NchKbd key-label="Esc" />
        </Button>
        <Button type="submit" :disabled="!chosenPoint">
          <LoaderCircle v-if="isRewinding" class="size-4 animate-spin" aria-hidden="true" />
          <History v-else class="size-4" aria-hidden="true" />
          {{ t('rewind.submit') }}
          <NchKbd key-label="Enter" is-on-fill />
        </Button>
      </div>
    </form>
  </NchResponsiveDialog>
</template>
