<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { FileCode, Folder, SquareSlash } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchKbd from '@/components/common/NchKbd.vue'
import { FILES_LIMIT } from '@/composables/useMentionMenu'
import type { MenuRowIcon, MenuSectionProps } from '@/types/composerMenu.type'
import type { TriggerKind } from '@/utils/composerTrigger'
import { nearestScrollOf } from '@/utils/nearestScroll'

// Figma 31 / 32: suggestions above the composer, grouped, the typed characters set apart. The
// field keeps the focus; it points here with `aria-activedescendant`.
const {
  id,
  kind,
  sections,
  activeKey = null,
  notice = null,
  isTruncated = false
} = defineProps<{
  id: string
  kind: TriggerKind
  sections: MenuSectionProps[]
  activeKey?: string | null
  notice?: string | null
  isTruncated?: boolean
}>()
const emit = defineEmits<{ pick: [key: string, mode: 'complete' | 'run'] }>()

const list = useTemplateRef<HTMLElement>('list')

const { t } = useI18n()

const ICONS: Record<MenuRowIcon, typeof FileCode> = {
  command: SquareSlash,
  file: FileCode,
  folder: Folder
}

const optionIds = computed(
  () =>
    new Map(
      sections
        .flatMap((section) => section.rows)
        .map((row, index) => [row.key, `${id}-option-${index}`])
    )
)

/** The option the field announces as active. */
const activeOptionId = computed(() => (activeKey ? (optionIds.value.get(activeKey) ?? null) : null))

// Only the list scrolls, never the chat around the menu.
const scrollToActive = async () => {
  await nextTick()
  const el = list.value
  if (!activeOptionId.value || !el) return
  const option = el.querySelector(`#${activeOptionId.value}`)
  if (!option) return
  const item = option.getBoundingClientRect()
  // The first row of a section brings its heading along.
  const group = option.closest('[role="group"]')
  const isFirstInGroup = group?.querySelector('[role="option"]') === option
  const itemStart = isFirstInGroup ? group.getBoundingClientRect().top : item.top
  const viewStart = el.getBoundingClientRect().top + el.clientTop
  el.scrollTop = nearestScrollOf(
    { itemStart, itemEnd: item.bottom, viewStart, viewEnd: viewStart + el.clientHeight },
    el.scrollTop
  )
}

watch(() => activeKey, scrollToActive)

defineExpose({ activeOptionId })
</script>

<template>
  <div
    class="flex max-h-[min(26rem,55vh)] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
  >
    <div
      :id
      ref="list"
      role="listbox"
      :aria-label="t('prompt_input.menu_label')"
      class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5"
    >
      <p v-if="notice" class="px-2 py-3 text-small text-muted-foreground">{{ notice }}</p>
      <div
        v-for="section in sections"
        :key="section.title"
        role="group"
        :aria-label="section.title"
      >
        <p
          class="px-2 pt-2 pb-1 text-meta font-medium tracking-wide text-muted-foreground uppercase"
          aria-hidden="true"
        >
          {{ section.title }}
        </p>
        <div
          v-for="row in section.rows"
          :id="optionIds.get(row.key)"
          :key="row.key"
          role="option"
          :aria-selected="row.key === activeKey"
          class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5"
          :class="row.key === activeKey ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'"
          @mousedown.prevent
          @click="emit('pick', row.key, kind === 'slash' ? 'run' : 'complete')"
        >
          <component
            :is="ICONS[row.icon]"
            class="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span
            class="flex min-w-0 shrink-0 items-baseline gap-1.5 font-mono text-small"
            :class="kind === 'mention' ? 'max-w-[70%]' : 'max-w-[65%]'"
          >
            <!-- A command's name is what the user reads first; its hint gives way first. -->
            <span class="min-w-0 truncate">
              <template v-for="(piece, index) in row.label" :key="index">
                <mark v-if="piece.isHit" class="bg-transparent font-semibold text-brand">{{
                  piece.text
                }}</mark>
                <template v-else>{{ piece.text }}</template>
              </template>
            </span>
            <span
              v-if="row.hint"
              class="hidden max-w-[24ch] min-w-0 shrink-[100] truncate text-meta text-muted-foreground sm:inline"
            >
              {{ row.hint }}
            </span>
          </span>
          <span class="min-w-0 flex-1 truncate text-small text-muted-foreground">
            <template v-for="(piece, index) in row.detail" :key="index">
              <mark v-if="piece.isHit" class="bg-transparent text-foreground">{{
                piece.text
              }}</mark>
              <template v-else>{{ piece.text }}</template>
            </template>
          </span>
          <span
            v-if="row.tag"
            class="shrink-0 rounded border border-border px-1.5 text-meta text-muted-foreground"
          >
            {{ row.tag }}
          </span>
        </div>
      </div>
    </div>
    <div
      class="flex items-center gap-1 border-t border-border px-3.5 py-2 text-meta text-muted-foreground pointer-coarse:hidden"
    >
      <i18n-t
        v-if="kind === 'slash'"
        keypath="prompt_input.commands_hint"
        tag="span"
        class="flex items-center gap-1"
        scope="global"
      >
        <template #up><NchKbd key-label="↑" /></template>
        <template #down><NchKbd key-label="↓" class="ml-0.5" /></template>
        <template #tab><NchKbd key-label="Tab" /></template>
        <template #enter><NchKbd key-label="Enter" /></template>
        <template #esc><NchKbd key-label="Esc" /></template>
      </i18n-t>
      <template v-else>
        <i18n-t
          keypath="prompt_input.files_hint"
          tag="span"
          class="flex items-center gap-1"
          scope="global"
        >
          <template #tab><NchKbd key-label="Tab" /></template>
        </i18n-t>
        <span v-if="isTruncated" class="ml-auto">
          {{ t('prompt_input.files_truncated', { n: FILES_LIMIT }) }}
        </span>
      </template>
    </div>
  </div>
</template>
