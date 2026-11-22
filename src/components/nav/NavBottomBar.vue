<script setup lang="ts">
import { computed } from 'vue'
import { Settings } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { NAV_ICON, navItemList, navPageList } from '@/utils/navigation'

// The phone's way between pages (Figma "M01", "M14", "M15", "M22"). It sits on the home
// indicator's safe area; an open chat hides it, because the composer takes that place.
const { t } = useI18n()
const route = useRoute()

// Icon in brand blue when current; the label stays in ink, brand text is under 4.5:1 on light.
// The current icon lifts a little, on the marker's curve.
const ITEM_CLASS =
  'relative flex min-h-14 flex-1 touch-manipulation flex-col items-center justify-center gap-1 text-meta text-muted-foreground outline-none motion-press focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:font-medium aria-[current=page]:text-foreground [&_svg]:transition-transform [&_svg]:duration-250 [&_svg]:ease-out-soft [&[aria-current=page]_svg]:-translate-y-0.5 [&[aria-current=page]_svg]:scale-110 [&[aria-current=page]_svg]:text-brand'

const activeIndex = computed(() => navItemList.findIndex((item) => item === route.name))
// One marker glides to the current item instead of the highlight jumping (Kramlos, motion.md
// "Sliding marker"). The items are equally wide, so the index is enough.
const markerStyle = computed(() => ({
  width: `${100 / navItemList.length}%`,
  transform: `translateX(${Math.max(activeIndex.value, 0) * 100}%)`
}))
</script>

<template>
  <nav
    :aria-label="t('nav.label')"
    class="flex shrink-0 border-t border-border bg-background px-safe pb-[env(safe-area-inset-bottom)]"
  >
    <div class="relative flex flex-1">
      <span
        class="pointer-events-none absolute top-0 left-0 flex h-14 justify-center pt-1 transition-[transform,opacity] duration-250 ease-out-soft"
        :class="{ 'opacity-0': activeIndex < 0 }"
        :style="markerStyle"
        aria-hidden="true"
        data-testid="nav-marker"
      >
        <span class="h-7 w-14 rounded-full bg-brand/12" />
      </span>
      <RouterLink v-for="page in navPageList" :key="page" :to="{ name: page }" :class="ITEM_CLASS">
        <component :is="NAV_ICON[page]" class="size-5" aria-hidden="true" />
        {{ t(page === 'chat' ? 'nav.chats' : `nav.${page}`) }}
      </RouterLink>
      <!-- Current on every settings screen, not only on the list. -->
      <RouterLink
        :to="{ name: 'settings' }"
        :class="ITEM_CLASS"
        :aria-current="route.name === 'settings' ? 'page' : undefined"
      >
        <Settings class="size-5" aria-hidden="true" />
        {{ t('nav.settings') }}
      </RouterLink>
    </div>
  </nav>
</template>
