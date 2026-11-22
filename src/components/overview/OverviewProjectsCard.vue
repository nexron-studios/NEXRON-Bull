<script setup lang="ts">
import { computed } from 'vue'
import { CircleAlert, FolderGit2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import { Skeleton } from '@/components/ui/skeleton'
import OverviewBarRow from '@/components/overview/OverviewBarRow.vue'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { RECENT_DAYS, type ProjectActivity } from '@/utils/activityGrid'

// Figma "39 Übersicht": what the last month went into, by tokens.
const { projects } = defineProps<{
  projects: ProjectActivity[]
  isPending: boolean
  isError: boolean
}>()

const SKELETON_ROWS = 5

const { t } = useI18n()
const format = useUsageFormat()

const biggest = computed(() => projects[0]?.tokens ?? 0)
</script>

<template>
  <section
    class="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    aria-labelledby="overview-projects"
  >
    <header class="flex flex-col gap-0.5">
      <h2 id="overview-projects" class="flex items-center gap-2 text-body font-semibold">
        <FolderGit2 class="size-4 text-muted-foreground" aria-hidden="true" />
        {{ t('overview.activity.projects_title') }}
      </h2>
      <p class="text-small text-muted-foreground">
        {{ t('overview.activity.recent', { n: RECENT_DAYS }) }}
      </p>
    </header>
    <ul v-if="isPending" class="flex flex-col gap-3" aria-hidden="true">
      <Skeleton v-for="row in SKELETON_ROWS" :key="row" class="h-5" />
    </ul>
    <NchEmpty
      v-else-if="isError"
      :icon="CircleAlert"
      size="sm"
      :title="t('overview.activity.error_title')"
      :hint="t('overview.activity.error_hint')"
      class="motion-shake flex-1"
    />
    <ul v-else-if="projects.length" class="flex flex-col gap-3">
      <OverviewBarRow
        v-for="(project, index) in projects"
        :key="project.path"
        class="motion-stagger"
        :style="{ '--stagger-index': index }"
        :share="biggest ? project.tokens / biggest : 0"
        :value="format.compact(project.tokens)"
        :note="t('overview.activity.sessions', { n: project.sessions }, project.sessions)"
      >
        <span class="truncate">{{ project.name || project.path }}</span>
      </OverviewBarRow>
    </ul>
    <NchEmpty
      v-else
      :icon="FolderGit2"
      size="sm"
      :title="t('overview.activity.projects_empty')"
      :hint="t('overview.activity.recent_empty_hint', { n: RECENT_DAYS })"
      class="flex-1"
    />
  </section>
</template>
