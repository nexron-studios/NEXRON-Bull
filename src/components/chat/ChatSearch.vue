<script setup lang="ts">
import { computed, onMounted, useId, useTemplateRef } from 'vue'
import { ChevronDown, ChevronUp, Search, SearchX, X } from '@lucide/vue'
import { onClickOutside } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchKbd from '@/components/common/NchKbd.vue'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import { useAgeFormat } from '@/composables/useAgeFormat'
import type { ChatSearchState } from '@/composables/useChatSearch'
import { useMinuteClock } from '@/composables/useClock'
import { snippetOf, type SearchHit } from '@/utils/chatSearch'
import { isScrollbarHit } from '@/utils/scrollbarHit'

const OUTSIDE_IGNORED = [
  '[data-search-button]',
  '[data-reka-popper-content-wrapper]',
  '[role="dialog"]',
  '[role="menu"]'
]

// The search over one chat (Figma "13"): a field floating top right, its hits below while typing,
// and a mark per hit along the scrollbar.
const { search } = defineProps<{ search: ChatSearchState }>()

/** `close`: Esc or the X, focus goes back to the composer. `dismiss`: a click elsewhere, focus
 * stays where it went. */
const emit = defineEmits<{ close: []; dismiss: [] }>()

const input = useTemplateRef<HTMLInputElement>('input')
const field = useTemplateRef<HTMLElement>('field')
const inputRow = useTemplateRef<HTMLElement>('inputRow')

const { t } = useI18n()
const id = useId()
const now = useMinuteClock()
const formatAge = useAgeFormat()

const total = computed(() => search.hits.length)
const countText = computed(() => {
  if (total.value) return t('chat_search.count', { current: search.active + 1, total: total.value })
  return search.query.trim() && search.isSettled ? t('chat_search.none') : ''
})
const isEmpty = computed(() => !!search.query.trim() && search.isSettled && !total.value)
const isListShown = computed(() => search.isListOpen && total.value > 0)

const whoOf = ({ source }: SearchHit): string => {
  switch (source.kind) {
    case 'user':
      return t('chat_search.you')
    case 'claude':
      return t('chat_search.claude')
    case 'tool':
      return source.name
    default: {
      const unhandled: never = source
      throw new Error(`Unhandled search source: ${JSON.stringify(unhandled)}`)
    }
  }
}
const ageOf = ({ at }: SearchHit): string | null =>
  at ? formatAge.value(Math.max(0, now.value.getTime() - Date.parse(at))) : null
const optionIdOf = (index: number) => `${id}-hit-${index}`

// An IME composing a word owns Enter and Esc until it is done.
const handleKeydown = (event: KeyboardEvent) => {
  if (event.isComposing) return
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      return isListShown.value ? search.moveActive(delta) : search.step(delta)
    }
    case 'Enter':
      event.preventDefault()
      return isListShown.value
        ? void search.jump(search.active)
        : search.step(event.shiftKey ? -1 : 1)
  }
}
// Esc closes from anywhere in the search, also after a click on a button, and never reaches the
// chat's own Esc (stopping Claude, the double-Escape rewind).
const handleEscape = (event: KeyboardEvent) => {
  if (event.isComposing) return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

const focus = () => {
  input.value?.focus()
  input.value?.select()
}

/**
 * The input row in viewport px, where a card revealed in the chat must not land. Not the hits below
 * it: they close once one is picked, and counting them would push the card out of a short chat.
 */
const coverOf = (): DOMRect | null => inputRow.value?.getBoundingClientRect() ?? null

// Selecting a found passage or dragging the scrollbar past the hit marks is still reading, not
// leaving the search.
const isReadingClick = (event: Event): boolean => {
  if (window.getSelection()?.isCollapsed === false) return true
  const { target } = event
  return (
    event instanceof MouseEvent &&
    target instanceof HTMLElement &&
    isScrollbarHit(event.offsetX, event.offsetY, target)
  )
}
const handleOutsideClick = (event: Event) => {
  if (isReadingClick(event)) return
  emit('dismiss')
}
// The magnifier in the session bar focuses the open field instead; a menu, tooltip or dialog
// opened over the chat lives outside it in the DOM but is not a click away.
onClickOutside(field, handleOutsideClick, { ignore: OUTSIDE_IGNORED })

onMounted(focus)

defineExpose({ focus, coverOf })
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-20">
    <div
      ref="field"
      class="pointer-events-auto absolute top-2 right-4 flex w-[min(26rem,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-(--shadow-lift)"
      data-search-field
      @keydown.esc="handleEscape"
    >
      <div ref="inputRow" class="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
        <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref="input"
          :value="search.query"
          type="search"
          role="combobox"
          autocomplete="off"
          spellcheck="false"
          :aria-label="t('chat_search.label')"
          :placeholder="t('chat_search.placeholder')"
          :aria-expanded="isListShown"
          :aria-controls="`${id}-hits`"
          :aria-activedescendant="isListShown ? optionIdOf(search.active) : undefined"
          class="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          @input="search.type(($event.target as HTMLInputElement).value)"
          @keydown="handleKeydown"
        />
        <span class="shrink-0 text-meta text-muted-foreground tabular-nums" aria-live="polite">
          {{ countText }}
        </span>
        <span class="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
        <NchIconButton
          :label="t('chat_search.previous')"
          size="icon-sm"
          :disabled="!total"
          @click="search.step(-1)"
        >
          <ChevronUp class="size-4" aria-hidden="true" />
        </NchIconButton>
        <NchIconButton
          :label="t('chat_search.next')"
          size="icon-sm"
          :disabled="!total"
          @click="search.step(1)"
        >
          <ChevronDown class="size-4" aria-hidden="true" />
        </NchIconButton>
        <NchIconButton :label="t('chat_search.close')" size="icon-sm" @click="emit('close')">
          <X class="size-4" aria-hidden="true" />
        </NchIconButton>
      </div>
      <template v-if="isListShown">
        <ul
          :id="`${id}-hits`"
          role="listbox"
          :aria-label="t('chat_search.results')"
          class="flex max-h-80 flex-col gap-0.5 overflow-y-auto border-t border-border p-1"
        >
          <li
            v-for="(hit, index) in search.hits"
            :id="optionIdOf(index)"
            :key="`${hit.key}:${hit.start}:${index}`"
            role="option"
            :aria-selected="index === search.active"
            class="motion-stagger flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted"
            :class="{ 'bg-accent hover:bg-accent': index === search.active }"
            :style="{ '--stagger-index': index }"
            @mousedown.prevent
            @click="search.jump(index)"
          >
            <span class="w-12 shrink-0 truncate text-meta font-medium text-muted-foreground">
              {{ whoOf(hit) }}
            </span>
            <span
              class="min-w-0 flex-1 truncate text-small text-muted-foreground"
              :class="{ 'font-mono': hit.source.kind === 'tool' }"
            >
              {{ snippetOf(hit).before
              }}<span class="font-semibold text-foreground underline underline-offset-2">{{
                snippetOf(hit).term
              }}</span
              >{{ snippetOf(hit).after }}
            </span>
            <span v-if="ageOf(hit)" class="shrink-0 text-meta text-muted-foreground tabular-nums">
              {{ ageOf(hit) }}
            </span>
          </li>
        </ul>
        <p
          class="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-border px-3 py-2 text-meta text-muted-foreground"
        >
          <NchKbd key-label="↑↓" />{{ t('chat_search.key_pick') }}
          <NchKbd key-label="↵" class="ml-1" />{{ t('chat_search.key_jump') }}
          <NchKbd key-label="⇧↵" class="ml-1" />{{ t('chat_search.key_back') }}
          <NchKbd key-label="Esc" class="ml-1" />{{ t('chat_search.key_close') }}
        </p>
      </template>
      <NchSectionEmpty
        v-else-if="isEmpty"
        :icon="SearchX"
        :title="t('chat_search.empty_title')"
        :hint="t('chat_search.empty_hint')"
        class="motion-fade-in border-t border-border px-3 py-3"
      />
    </div>
    <!-- Where the hits are, as a strip beside the scrollbar; the current one in full colour. -->
    <template v-for="(at, index) in search.ticks" :key="index">
      <span
        v-if="at !== null"
        class="absolute right-0.5 h-0.5 w-1.5 rounded-full bg-brand"
        :class="index === search.active ? 'opacity-100' : 'opacity-50'"
        :style="{ top: `${at * 100}%` }"
        aria-hidden="true"
      />
    </template>
  </div>
</template>
