<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Skeleton } from '@/components/ui/skeleton'

// The session list while `recent` loads (Figma "M03"): a group heading, then rows with the
// round status icon, title and folder line, and the age on the right.
const { t } = useI18n()

const GROUP_ROWS = [2, 3]
</script>

<template>
  <div class="flex flex-col px-1" role="status">
    <span class="sr-only">{{ t('sidebar.loading') }}</span>
    <section v-for="(count, group) in GROUP_ROWS" :key="group" aria-hidden="true">
      <Skeleton class="mt-5 mb-2.5 ml-2 h-3 w-20 rounded-full" />
      <div v-for="row in count" :key="row" class="flex items-center gap-3 py-3 pr-2.5 pl-2">
        <Skeleton class="size-4 shrink-0 rounded-full" />
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton class="h-3 w-4/5 rounded-full" />
          <Skeleton class="h-2.5 w-2/5 rounded-full" />
        </div>
        <Skeleton class="h-2.5 w-8 shrink-0 self-start rounded-full" />
      </div>
    </section>
  </div>
</template>
