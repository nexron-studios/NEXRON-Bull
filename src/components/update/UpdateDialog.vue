<script setup lang="ts">
import { computed, type Component } from 'vue'
import { Globe, MessagesSquare, RefreshCw, TriangleAlert } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'
import UpdateProgress from '@/components/update/UpdateProgress.vue'
import { Button, type ButtonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { handleError } from '@/lib/error'
import { openLink } from '@/lib/links'
import { useAppUpdateStore } from '@/stores/appUpdate'
import {
  BULL_RELEASES_URL,
  updateDialogViewOf,
  type UpdateAction,
  type UpdateText
} from '@/utils/appUpdateDialog'

// Bull's update over a blurred window (Figma "42a" to "42e"): what is new, the download, then the
// restart. Closing it never stops anything; the sidebar card keeps the update in reach.
const store = useAppUpdateStore()
const { phase, isAutomatic, isDialogOpen } = storeToRefs(store)

const { t } = useI18n()

const ACTION: Record<UpdateAction, { variant: ButtonVariants['variant']; icon?: Component }> = {
  open_github: { variant: 'ghost', icon: Globe },
  later: { variant: 'outline' },
  background: { variant: 'outline' },
  update_now: { variant: 'default', icon: RefreshCw },
  restart: { variant: 'default', icon: RefreshCw },
  retry: { variant: 'default', icon: RefreshCw }
}

const view = computed(() => updateDialogViewOf(phase.value, isAutomatic.value, __APP_VERSION__))
const isOpen = computed({
  get: () => isDialogOpen.value && view.value !== null,
  set: (isNowOpen) => {
    if (!isNowOpen && view.value?.isClosable === false) return
    isDialogOpen.value = isNowOpen
  }
})

const textOf = (text: UpdateText) => t(text.key, text.params ?? {})

const run = (action: UpdateAction) => {
  switch (action) {
    case 'later':
    case 'background':
      isDialogOpen.value = false
      return
    case 'update_now':
      return void store.download()
    case 'restart':
      return void store.restart()
    case 'retry':
      return void store.retry()
    case 'open_github':
      return void openLink(BULL_RELEASES_URL).catch(handleError)
    default: {
      const unhandled: never = action
      throw new Error(`Unhandled update action: ${unhandled}`)
    }
  }
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent
      v-if="view"
      class="grid-cols-[minmax(0,1fr)] gap-4 p-5 sm:max-w-[27.5rem]"
      :show-close-button="view.isClosable"
    >
      <DialogHeader class="flex-row items-start gap-3 pr-6 text-left">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
          <BrandBullLogo :size="24" />
        </span>
        <div class="flex min-w-0 flex-col gap-0.5">
          <DialogTitle class="text-body font-semibold">{{ textOf(view.title) }}</DialogTitle>
          <DialogDescription class="text-meta">{{ textOf(view.sub) }}</DialogDescription>
        </div>
      </DialogHeader>

      <section
        v-if="view.notes.length"
        class="flex flex-col gap-2 rounded-lg border border-border bg-card px-3.5 py-3"
      >
        <h3 class="text-meta font-semibold text-muted-foreground">{{ t('update.notes_title') }}</h3>
        <ul class="flex flex-col gap-1.5">
          <li v-for="note in view.notes" :key="note" class="flex gap-2 text-small">
            <span class="mt-2 size-1 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <span class="min-w-0 break-words">{{ note }}</span>
          </li>
        </ul>
      </section>

      <div
        v-if="view.error"
        class="flex items-start gap-2.5 rounded-lg bg-critical/7 px-3 py-2.5"
        role="alert"
      >
        <TriangleAlert class="mt-0.5 size-4 shrink-0 text-critical" aria-hidden="true" />
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-small font-medium">{{ textOf(view.error.text) }}</span>
          <span class="font-mono text-meta break-words text-muted-foreground">
            {{ view.error.reason }}
          </span>
        </div>
      </div>

      <UpdateProgress v-if="view.progress" :progress="view.progress" />

      <p class="flex items-start gap-2 text-meta text-muted-foreground">
        <MessagesSquare class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {{ textOf(view.hint) }}
      </p>

      <div v-if="view.actions.length" class="flex flex-wrap justify-end gap-2">
        <Button
          v-for="action in view.actions"
          :key="action"
          :variant="ACTION[action].variant"
          class="motion-press"
          @click="run(action)"
        >
          <component
            :is="ACTION[action].icon"
            v-if="ACTION[action].icon"
            data-icon="inline-start"
            aria-hidden="true"
          />
          {{ t(`update.${action}`) }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
