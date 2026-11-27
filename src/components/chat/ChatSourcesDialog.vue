<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { ArrowUpRight, Globe, Search, SearchX } from '@lucide/vue'
import { useFuse } from '@vueuse/integrations/useFuse'
import { useI18n } from 'vue-i18n'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useScrollEdges } from '@/composables/useScrollEdges'
import { useIsPhone } from '@/composables/useViewport'
import { handleError } from '@/lib/error'
import { openLink } from '@/lib/links'
import { groupSourcesByDomain, pathOf, type Source } from '@/utils/sources'

// Every page of a turn behind the "+N" chip (Figma "Fassung 16"): grouped by site in reading
// order, searchable. Rows open in the system browser like the chips.
const { sources } = defineProps<{ sources: Source[] }>()

const open = defineModel<boolean>('open', { required: true })

const query = ref('')
const list = useTemplateRef<HTMLElement>('list')

const { t } = useI18n()
const isPhone = useIsPhone()
const { hasMoreAbove, hasMoreBelow } = useScrollEdges(list)
// Title and path before the site: those are what a person remembers of a page.
const { results } = useFuse(query, () => sources, {
  fuseOptions: {
    keys: [
      { name: 'title', weight: 3 },
      { name: 'url', weight: 2 },
      { name: 'domain', weight: 1 }
    ],
    threshold: 0.35,
    ignoreLocation: true
  },
  matchAllWhenSearchEmpty: true
})

const matches = computed(() => results.value.map((result) => result.item))
// Groups keep reading order while searching, not Fuse's score order: the list must not reshuffle.
const groups = computed(() => {
  const found = new Set(matches.value)
  return groupSourcesByDomain(sources.filter((source) => found.has(source)))
})
const siteCount = computed(() => groupSourcesByDomain(sources).length)
const countLabel = computed(() =>
  query.value
    ? t('chat.sources.found', { n: matches.value.length, total: sources.length })
    : t('chat.sources.count', {
        pages: t('chat.sources.pages', { n: sources.length }, sources.length),
        sites: t('chat.sources.sites', { n: siteCount.value }, siteCount.value)
      })
)

const openSource = (url: string) => openLink(url).catch(handleError)
// Esc in a filled search clears it first; only an empty search lets Esc close the dialog.
const clearOrClose = (event: KeyboardEvent) => {
  if (!query.value) return
  event.preventDefault()
  event.stopPropagation()
  query.value = ''
}

// A reopened dialog starts with the whole list.
watch(open, (isOpen) => {
  if (isOpen) query.value = ''
})
</script>

<template>
  <!-- On the phone the sheet body scrolls the list; a second fixed-height scroller inside it
       would fight over the swipe. Sections fade in without an offset: an offset entry inside a
       scrolling list flashes its scrollbar (motion.md). -->
  <NchResponsiveDialog
    v-model:open="open"
    :title="t('chat.sources.title', { n: sources.length }, sources.length)"
    :description="t('chat.sources.description')"
    content-class="sm:max-w-xl"
    :should-focus-first="!isPhone"
  >
    <div class="flex min-h-0 flex-col gap-3">
      <div class="relative">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          v-model="query"
          type="search"
          name="source-search"
          autocomplete="off"
          class="pl-9"
          :aria-label="t('chat.sources.search')"
          :placeholder="t('chat.sources.search_placeholder')"
          @keydown.esc="clearOrClose"
        />
      </div>
      <p class="text-meta text-muted-foreground tabular-nums" aria-live="polite">
        {{ countLabel }}
      </p>
      <div class="relative -mx-1 flex min-h-0 flex-col">
        <div
          ref="list"
          class="flex min-h-0 flex-col px-1 pb-1"
          :class="{ 'h-[min(26rem,55dvh)] overflow-y-auto': !isPhone }"
        >
          <NchSectionEmpty
            v-if="!groups.length"
            :icon="SearchX"
            :title="t('chat.sources.no_match')"
            :hint="t('chat.sources.no_match_hint')"
            class="py-2 [--section-tile:var(--accent)]"
          >
            <Button variant="outline" size="sm" class="self-start" @click="query = ''">
              {{ t('chat.sources.reset') }}
            </Button>
          </NchSectionEmpty>
          <section v-for="group in groups" :key="group.domain" class="motion-fade-in">
            <h3
              class="sticky top-0 z-10 flex items-center gap-2 bg-popover/90 py-1.5 text-meta font-medium text-foreground backdrop-blur-md backdrop-saturate-180"
            >
              <Globe class="size-3.5 shrink-0 text-act-read" aria-hidden="true" />
              <span class="min-w-0 truncate">{{ group.domain }}</span>
              <span class="text-muted-foreground tabular-nums">{{ group.sources.length }}</span>
            </h3>
            <ul class="mb-5 flex flex-col">
              <li v-for="source in group.sources" :key="source.url">
                <a
                  :href="source.url"
                  class="motion-press group flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-visible:bg-accent"
                  @click.prevent="openSource(source.url)"
                >
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span v-if="source.title" class="truncate text-small text-foreground">
                      {{ source.title }}
                    </span>
                    <span class="truncate text-meta text-subtle">{{ pathOf(source.url) }}</span>
                  </span>
                  <ArrowUpRight
                    class="size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                    aria-hidden="true"
                  />
                </a>
              </li>
            </ul>
          </section>
        </div>
        <NchScrollEdge edge="top" :is-shown="hasMoreAbove" />
        <NchScrollEdge edge="bottom" :is-shown="hasMoreBelow" />
      </div>
    </div>
  </NchResponsiveDialog>
</template>
